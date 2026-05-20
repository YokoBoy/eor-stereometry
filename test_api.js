const fetch = require('node-fetch');

async function test() {
  try {
    const r = await fetch('http://localhost:3000/api/videos/comments/pending');
    console.log("Status:", r.status);
    console.log("Content-Type:", r.headers.get('content-type'));
    const text = await r.text();
    console.log("Body:", text);
  } catch (e) {
    console.error(e);
  }
}

test();
