async function handleForty(req,env,u){
 if(u.pathname!=='/api/forty')return null;
 const initial={version:1,selection:FORTY.entries.filter(e=>e.group==='core').map(e=>e.id)};
 if(req.method==='GET'){try{const o=await env.BUCKET.get('collection/forty-v1.json');return new Response(JSON.stringify(o?await o.json():initial),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','ETag':o?.httpEtag||'"empty"','X-Elsewhere-Revision':normEtag(o?.httpEtag||'"empty"')}})}catch{return json({error:'Could not load the forty collection'},500)}}
 if(req.method!=='PUT')return json({error:'Method not allowed'},405);
 if(req.headers.get('Origin')!==u.origin)return json({error:'Origin not allowed'},403);
 try{const raw=await req.text();if(raw.length>300000)return json({error:'Selection too large'},413);const p=JSON.parse(raw);
 const old=await env.BUCKET.get('collection/forty-v1.json'),etag=old?.httpEtag||'"empty"',match=req.headers.get('X-Elsewhere-Revision')||req.headers.get('If-Match');if(normEtag(match)!==normEtag(etag))return json({error:'The collection changed elsewhere. Reload before making this swap.'},409);
 // Older clients send only {version, selection}; keep personal notes and optional additions they do not know about.
 const prev=old?await old.json():initial;if(p&&p.personal===undefined&&prev.personal)p.personal=prev.personal;if(p&&p.extras===undefined&&prev.extras)p.extras=prev.extras;
 const invalid=validateForty(p,FORTY);if(invalid)return json({error:invalid},400);
 const saved=await env.BUCKET.put('collection/forty-v1.json',JSON.stringify(p),{httpMetadata:{contentType:'application/json'},onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'}});if(!saved)return json({error:'A concurrent change was saved. Reload before making this swap.'},409);
 return new Response(JSON.stringify({saved:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','ETag':saved.httpEtag,'X-Elsewhere-Revision':normEtag(saved.httpEtag)}});
 }catch{return json({error:'Could not save the forty collection'},500)}
}
