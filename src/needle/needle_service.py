import os
import sys
import json
import re
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
import needle

# -----------------------------------------------------------------------------
# Tool Definitions (Constrained Needle Decorators)
# -----------------------------------------------------------------------------

@needle.tool(triggers=['route', 'cable', 'cctv', 'paga', 'preview', 'connect', 'wire'])
def preview_route(
    source_device_id: str,
    target_destination_id: str,
    cable_type: str = 'CAT6A_F_UTP',
    routing_preference: str = 'APPROVED_CONTAINMENT',
    target_elevation_m: float = 4.5
) -> dict:
    """Preview a 3D cable route from a source device (e.g. CCTV-021, SPK-101) to a destination room or panel (e.g. CONTROL_ROOM, PAGA-CAB-A) at an approved elevation."""
    return {
        'tool': 'preview_route',
        'source': source_device_id,
        'destination': target_destination_id,
        'cable_type': cable_type,
        'routing_preference': routing_preference,
        'elevation_m': target_elevation_m
    }

@needle.tool(triggers=['inspect', 'find', 'locate', 'status', 'where', 'check'])
def inspect_device(device_tag: str) -> dict:
    """Inspect equipment properties, 3D mounting coordinates, elevations, and network group for a given device tag (e.g. CCTV-021, SPK-101)."""
    return {
        'tool': 'inspect_device',
        'device_tag': device_tag
    }

@needle.tool(triggers=['search', 'devices', 'list', 'cameras', 'speakers', 'inventory'])
def find_objects(query: str = '', system_type: str = 'ALL', category: str = 'ALL') -> dict:
    """Search plant devices, panels, or containment segments matching a search string or subsystem (e.g. CCTV, PAGA, POWER, ACCESS_CONTROL)."""
    return {
        'tool': 'find_objects',
        'query': query,
        'system_type': system_type,
        'category': category
    }

@needle.tool(triggers=['containment', 'tray', 'ladder', 'trunking', 'corridor', 'conduit', 'seg'])
def find_approved_containment(system_type: str = 'CCTV_DATA', elevation_m: float = 4.2) -> dict:
    """Find approved cable trays, ladders, or conduits for a given system type and elevation."""
    return {
        'tool': 'find_approved_containment',
        'system_type': system_type,
        'elevation_m': elevation_m
    }

@needle.tool(triggers=['elevation', 'riser', 'drop', 'vertical', 'shaft'])
def preview_elevation_change(from_elevation_m: float = 0.0, to_elevation_m: float = 4.5) -> dict:
    """Preview a vertical conduit riser or drop between two elevations."""
    return {
        'tool': 'preview_elevation_change',
        'from_elevation_m': from_elevation_m,
        'to_elevation_m': to_elevation_m
    }

@needle.tool(triggers=['explain', 'rule', 'violation', 'why', 'failed', 'standards'])
def explain_rule_violation(rule_id: str) -> dict:
    """Explain an engineering rule violation code (e.g. RULE-WALL-001, RULE-ELEV-001, RULE-PAGA-001) and engineering remediation advice."""
    return {
        'tool': 'explain_rule_violation',
        'rule_id': rule_id
    }

ALL_TELECOM_TOOLS = [
    preview_route,
    inspect_device,
    find_objects,
    find_approved_containment,
    preview_elevation_change,
    explain_rule_violation
]

_agent_instance = None

def get_needle_agent():
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = needle.Needle(tools=ALL_TELECOM_TOOLS)
    return _agent_instance

def normalize_intent(raw_result: dict, query: str) -> dict:
    text = query.upper()
    tool_name = raw_result.get('tool', 'preview_route')

    if tool_name == 'inspect_device':
        return {
            'operation': 'inspect_object',
            'device_tag': raw_result.get('device_tag', '').upper(),
            'target': raw_result.get('device_tag', '').upper()
        }

    if tool_name == 'explain_rule_violation':
        return {
            'operation': 'explain_rule',
            'rule_id': raw_result.get('rule_id', '').upper()
        }

    if tool_name == 'find_objects':
        return {
            'operation': 'find_objects',
            'query': raw_result.get('query', ''),
            'system_type': raw_result.get('system_type', 'ALL'),
            'category': raw_result.get('category', 'ALL')
        }

    if tool_name == 'preview_elevation_change':
        return {
            'operation': 'change_elevation',
            'from_elevation_m': float(raw_result.get('from_elevation_m', 0.0)),
            'to_elevation_m': float(raw_result.get('to_elevation_m', 4.5))
        }

    src = raw_result.get('source', '')
    dst = raw_result.get('destination', '')
    pref_path = raw_result.get('pref', '') or raw_result.get('routing_preference', '')
    elev = raw_result.get('elev', None) or raw_result.get('elevation_m', None)

    # Refine source if generic label was extracted instead of specific tag
    known_tag = re.search(r'\b(CCTV-\d+|SPK-\d+|JB-[A-Z0-9]+|HSS-\d+|PAGA-CAB-[AB])\b', text)
    if known_tag and not re.search(r'\b[A-Z]+-\d+\b', src.upper()):
        src = known_tag.group(1)

    # Refine elevation from text if available
    elev_match = re.search(r'(\d+(?:\.\d+)?)\s*M(?:ETER|ETERS)?', text)
    if elev_match:
        try:
            elev = float(elev_match.group(1))
        except (ValueError, TypeError):
            pass

    # Clean preferred_path if it was misassigned as an elevation or measurement
    if re.match(r'^\d+(?:\.\d+)?M?$', pref_path):
        pref_path = 'APPROVED_CONTAINMENT'

    if 'THROUGH' in dst.upper():
        parts = re.split(r'\bTHROUGH\b', dst, flags=re.IGNORECASE)
        dst = parts[0].strip()
        if len(parts) > 1 and (not pref_path or pref_path in ('CABLE', 'APPROVED_CONTAINMENT')):
            pref_path = parts[1].strip()
    elif 'VIA' in dst.upper():
        parts = re.split(r'\bVIA\b', dst, flags=re.IGNORECASE)
        dst = parts[0].strip()
        if len(parts) > 1 and (not pref_path or pref_path in ('CABLE', 'APPROVED_CONTAINMENT')):
            pref_path = parts[1].strip()

    to_match = re.search(r'\bTO\s+([A-Za-z0-9\-_ ]+?)(?=\s+(?:THROUGH|VIA|AT|WITH|USING|$))', text)
    if to_match:
        dst = to_match.group(1).strip()
    elif not dst or dst.upper() in ('NONE', '', 'CABLE', 'UNKNOWN', 'OUTDOOR_WALKWAY', 'WALKWAY'):
        dst = 'UNKNOWN_DESTINATION'

    dst = dst.replace('THE ', '').strip().upper().replace(' ', '_')
    pref_path = pref_path.replace('THE ', '').strip().upper().replace(' ', '_')
    if pref_path in ('CABLE', 'APPROVED_CONTAINMENT', '', 'NONE') or re.match(r'^\d+(?:\.\d+)?M?$', pref_path):
        if 'CORRIDOR' in text:
            pref_path = 'OUTDOOR_CORRIDOR' if 'OUTDOOR' in text else 'CORRIDOR'
        else:
            pref_path = 'DEFAULT_CONTAINMENT'

    cable_type = 'CCTV_DATA'
    if re.search(r'\b(PAGA|SPEAKER|AUDIO|SPK)\b', text):
        cable_type = 'PAGA_LOOP_RETURN' if 'RETURN' in text else 'PAGA_AUDIO'
    elif re.search(r'\b(CCTV|CAMERA|LAN|DATA|CAT6|ETHERNET)\b', text):
        cable_type = 'CCTV_DATA'
    elif re.search(r'\b(FIBER|FIBRE|OPTIC|FO)\b', text):
        cable_type = 'FO_MM' if 'MM' in text else 'FO_SM'
    elif re.search(r'\b(POWER|230V|110V|FEEDER|LV)\b', text):
        cable_type = 'POWER_LV'
    elif re.search(r'\b(CONTROL CABLE|INSTRUMENT|INTERLOCK)\b', text):
        cable_type = 'CONTROL'

    topology = 'STAR'
    if 'LOOP' in text or 'CLASS A' in text or 'CLASS_A' in text or cable_type == 'PAGA_AUDIO':
        topology = 'CLASS_A_LOOP'
    elif 'RADIAL' in text:
        topology = 'RADIAL'
    elif 'DAISY' in text:
        topology = 'DAISY_CHAIN'

    if 'GROUND' in text or 'FLOOR' in text:
        elevation_val = 0.0
    elif elev is not None:
        try:
            elevation_val = float(elev)
        except (ValueError, TypeError):
            elevation_val = 4.5
    else:
        elevation_val = 4.5

    return {
        'operation': 'route_cable',
        'source': src.upper(),
        'destination': dst,
        'preferred_path': pref_path,
        'cable_type': cable_type,
        'elevation_m': elevation_val,
        'topology': topology
    }

def run_query(query_text: str) -> dict:
    agent = get_needle_agent()
    raw = agent.run(query_text)

    results = raw.get('results', [])
    first_tool_result = results[0] if results else {}

    intent = normalize_intent(first_tool_result, query_text)

    response = {
        'engine': 'cactus-needle',
        'version': needle.__version__,
        'query': query_text,
        'success': raw.get('success', True),
        'confidence': raw.get('confidence', 0.5),
        'prefill_tps': raw.get('prefill_tps', 0.0),
        'decode_tps': raw.get('decode_tps', 0.0),
        'peak_ram_mb': raw.get('peak_ram_mb', 0.0),
        'reasoning': raw.get('reasoning', ''),
        'tool_calls': results,
        'intent': intent,
        'evidence': {
            'engine': f'Cactus-Needle {needle.__version__}',
            'confidence_score': raw.get('confidence', 0.5),
            'prefill_tps': raw.get('prefill_tps', 0.0),
            'decode_tps': raw.get('decode_tps', 0.0),
            'peak_ram_mb': raw.get('peak_ram_mb', 0.0),
            'rationale': raw.get('reasoning') or 'Cactus-Needle foundation model extracted structured intent and arguments.',
            'source_document': 'TELECOM_MTO_MODEL',
            'drawing_number': 'DWG-TEL-001'
        }
    }
    return response

class NeedleHTTPHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            payload = {
                'status': 'ready',
                'engine': 'cactus-needle',
                'version': needle.__version__,
                'tools_registered': [t.__name__ for t in ALL_TELECOM_TOOLS]
            }
            self.wfile.write(json.dumps(payload).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path in ('/predict', '/api/needle/predict', '/run'):
            content_length = int(self.headers.get('Content-Length', 0))
            body_raw = self.rfile.read(content_length)
            try:
                body = json.loads(body_raw.decode('utf-8'))
            except Exception:
                body = {}

            query = body.get('query') or body.get('prompt') or ''
            if not query:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Missing query parameter'}).encode('utf-8'))
                return

            try:
                result = run_query(query)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(result).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        sys.stderr.write(f"[Needle-Sidecar] {format % args}\n")

def serve(port: int = 5005):
    print(f"[Needle-Sidecar] Warming up Cactus-Needle foundation model...")
    get_needle_agent()
    print(f"[Needle-Sidecar] Model resident in memory. Starting HTTP server on port {port}...")
    server = HTTPServer(('127.0.0.1', port), NeedleHTTPHandler)
    print(f"[Needle-Sidecar] Ready to serve inference requests at http://127.0.0.1:{port}/predict")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Needle-Sidecar] Shutting down.")
        server.server_close()

def main():
    parser = argparse.ArgumentParser(description='Cactus-Needle Telecom Tool Inference Engine')
    parser.add_argument('query', nargs='?', default=None, help='Natural language routing prompt to run')
    parser.add_argument('--serve', action='store_true', help='Start background HTTP sidecar service')
    parser.add_argument('--port', type=int, default=5005, help='Port for HTTP sidecar (default: 5005)')

    args = parser.parse_args()

    if args.serve:
        serve(args.port)
    elif args.query:
        res = run_query(args.query)
        print(json.dumps(res, indent=2))
    else:
        test_q = 'Route the CCTV cable from CCTV-021 to the control room through the outdoor corridor at 4.5 m elevation'
        res = run_query(test_q)
        print(json.dumps(res, indent=2))

if __name__ == '__main__':
    main()
