const fs = require('fs');
const vm = require('vm');

const contentMto = fs.readFileSync('Telecom_MTO_Lite.html', 'utf8');
const pStart = contentMto.indexOf('MTO_THREEJS_REVIEW_HTML');
const quoteStart = pStart + 'MTO_THREEJS_REVIEW_HTML = "'.length;
const htmlEnd = contentMto.indexOf('\\u003c/html>', pStart);
const quoteEnd = contentMto.indexOf('";', htmlEnd);
const raw = contentMto.slice(quoteStart, quoteEnd);

let outHtml = '';
let i = 0;
while (i < raw.length) {
  if (raw[i] === '\\' && raw[i+1] === '\\') {
    let code = raw[i+2];
    if (code === 'n') { outHtml += '\n'; i += 3; }
    else if (code === 'r') { outHtml += '\r'; i += 3; }
    else if (code === 't') { outHtml += '\t'; i += 3; }
    else if (code === '"') { outHtml += '"'; i += 3; }
    else if (code === '`') { outHtml += '`'; i += 3; }
    else if (code === '\\') {
      if (raw[i+3] === '\\') {
        outHtml += '\\';
        i += 4;
      } else {
        outHtml += '\\';
        i += 3;
      }
    } else if (code === 'u') {
      let hex = raw.slice(i + 3, i + 7);
      if (hex === '003c') { outHtml += '<'; i += 7; }
      else if (hex === '003e') { outHtml += '>'; i += 7; }
      else { outHtml += String.fromCharCode(parseInt(hex, 16)); i += 7; }
    } else { outHtml += code; i += 3; }
  } else if (raw[i] === '\\' && raw[i+1] === '`') { outHtml += '`'; i += 2; }
  else if (raw[i] === '\\' && raw[i+1] === '$') { outHtml += '$'; i += 2; }
  else if (raw[i] === '\\' && raw[i+1] === '"') { outHtml += '"'; i += 2; }
  else { outHtml += raw[i]; i++; }
}

const sStart = outHtml.indexOf('<script>') + '<script>'.length;
const sEnd = outHtml.lastIndexOf('</script>');
const script = outHtml.slice(sStart, sEnd);

new vm.Script(script);
fs.writeFileSync('mto_threejs_review_decoded_clean.html', outHtml, 'utf8');
console.log('Saved mto_threejs_review_decoded_clean.html successfully!');
