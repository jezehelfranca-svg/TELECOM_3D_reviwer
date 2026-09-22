"""
In-Memory Session Store for Needle 3D Agent.
Manages client drawing models, multi-turn message history, and inactivity expiration.
"""

import time
import uuid

SESSION_TTL_SECONDS = 1800  # 30 minutes


class NeedleSessionStore:
    def __init__(self, ttl_seconds: int = SESSION_TTL_SECONDS):
        self.ttl_seconds = ttl_seconds
        self._sessions = {}

    def _cleanup_expired(self):
        now = time.time()
        expired = [
            sid for sid, s in self._sessions.items()
            if now - s['last_active'] > self.ttl_seconds
        ]
        for sid in expired:
            del self._sessions[sid]

    def create_session(self, project_model: dict = None, context_token: str = '') -> str:
        self._cleanup_expired()
        session_id = f"sess_{uuid.uuid4().hex[:12]}"
        now = time.time()
        self._sessions[session_id] = {
            'session_id': session_id,
            'created_at': now,
            'last_active': now,
            'context_token': context_token,
            'project_model': project_model or {},
            'messages': []
        }
        return session_id

    def get_session(self, session_id: str) -> dict:
        self._cleanup_expired()
        session = self._sessions.get(session_id)
        if session:
            session['last_active'] = time.time()
        return session

    def update_model(self, session_id: str, project_model: dict, context_token: str = ''):
        session = self.get_session(session_id)
        if session:
            session['project_model'] = project_model
            if context_token:
                session['context_token'] = context_token
            session['last_active'] = time.time()
            return True
        return False

    def add_message(self, session_id: str, role: str, content: str, meta: dict = None):
        session = self.get_session(session_id)
        if session:
            msg = {
                'role': role,
                'content': content,
                'timestamp': time.time(),
                'meta': meta or {}
            }
            session['messages'].append(msg)
            return True
        return False


_global_store = None


def get_session_store() -> NeedleSessionStore:
    global _global_store
    if _global_store is None:
        _global_store = NeedleSessionStore()
    return _global_store
