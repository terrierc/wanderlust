const HUB_EMPTY={version:1,records:Object.fromEntries(HUB_KINDS.map(k=>[k,[]]))};
const DOC_TYPES={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
async function sha256Hex(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function handleHub(req,env,u){
 if(u.pathname.startsWith('/api/document/')){
  const id=u.pathname.slice(14);if(!/^[a-z0-9-]{1,90}$/.test(id))return json({error:'Invalid file id'},400);
  if(req.method==='HEAD'){const o=await env.BUCKET.head('documents/'+id);return o?new Response(null,{headers:{'Content-Length':String(o.size),'Content-Type':o.httpMetadata?.contentType||'application/octet-stream','X-Content-SHA256':o.customMetadata?.sha256||'','Cache-Control':'private,no-store'}}):new Response(null,{status:404})}
  if(req.method==='GET'){const o=await env.BUCKET.get('documents/'+id);return o?new Response(o.body,{headers:{'Content-Type':o.httpMetadata?.contentType||'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(o.customMetadata?.filename||('travel-document.'+(DOC_TYPES[o.httpMetadata?.contentType]||'bin'))),'X-Content-SHA256':o.customMetadata?.sha256||'','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}}):json({error:'File not found'},404)}
  if(req.headers.get('Origin')!==u.origin)return json({error:'Origin not allowed'},403);
  if(req.method==='DELETE'){await env.BUCKET.delete('documents/'+id);return json({saved:true})}
  if(req.method!=='PUT')return json({error:'Method not allowed'},405);
  const type=req.headers.get('Content-Type');if(!DOC_TYPES[type])return json({error:'Use PDF, JPG, PNG or WebP'},400);
  if(Number(req.headers.get('Content-Length'))>10000000)return json({error:'10 MB maximum'},413);
  const bytes=await req.arrayBuffer();if(bytes.byteLength>10000000)return json({error:'10 MB maximum'},413);
  const a=new Uint8Array(bytes),valid=type==='application/pdf'?String.fromCharCode(...a.slice(0,5))==='%PDF-':type==='image/jpeg'?a[0]===255&&a[1]===216:type==='image/png'?a[0]===137&&a[1]===80&&a[2]===78&&a[3]===71:String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP';
  if(!valid)return json({error:'File content does not match its type'},400);
  const sha=await sha256Hex(bytes),claimed=req.headers.get('X-Content-SHA256');if(claimed&&claimed!==sha)return json({error:'The upload was damaged in transit. It will be retried.'},422);
  await env.BUCKET.put('documents/'+id,bytes,{httpMetadata:{contentType:type},customMetadata:{sha256:sha,filename:(req.headers.get('X-File-Name')?decodeURIComponent(req.headers.get('X-File-Name')):'travel-document').replace(/[\r\n/\\]/g,'-').slice(0,200)}});return json({saved:true,id,sha256:sha});
 }
 if(u.pathname!=='/api/hub')return null;
 if(req.method==='GET'){const o=await env.BUCKET.get('workspace/hub-v1.json');return new Response(JSON.stringify(normaliseHub(o?await o.json():HUB_EMPTY)),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','ETag':o?.httpEtag||'"empty"','X-Elsewhere-Revision':normEtag(o?.httpEtag||'"empty"')}})}
 if(req.method!=='PUT')return json({error:'Method not allowed'},405);
 if(req.headers.get('Origin')!==u.origin)return json({error:'Origin not allowed'},403);
 try{const raw=await req.text();if(raw.length>2000000)return json({error:'Workspace too large'},413);const p=JSON.parse(raw);
 if(validateHub(p))return json({error:'Invalid workspace'},400);
 const old=await env.BUCKET.get('workspace/hub-v1.json'),match=req.headers.get('X-Elsewhere-Revision')||req.headers.get('If-Match');if(!match||normEtag(match)!==normEtag(old?.httpEtag||'"empty"'))return json({error:'This workspace changed in another window. Reload before editing.'},409);
 const saved=await env.BUCKET.put('workspace/hub-v1.json',JSON.stringify(normaliseHub(p)),{httpMetadata:{contentType:'application/json'},onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'}});if(!saved)return json({error:'A concurrent edit was saved. Reload before editing.'},409);
 return new Response(JSON.stringify({saved:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','ETag':saved.httpEtag,'X-Elsewhere-Revision':normEtag(saved.httpEtag)}});
 }catch{return json({error:'Workspace could not be saved'},500)}
}
