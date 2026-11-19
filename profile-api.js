async function handleProfile(req,env,u){
 if(u.pathname!=='/api/profile')return null;
 if(req.method==='GET'){try{const o=await env.BUCKET.get('profile/travel-v1.json');return new Response(JSON.stringify(o?await o.json():PROFILE_SEED),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','ETag':o?.httpEtag||'"empty"','X-Elsewhere-Revision':normEtag(o?.httpEtag||'"empty"')}})}catch{return json({error:'Could not load travel profile'},500)}}
 if(req.method!=='PUT')return json({error:'Method not allowed'},405);
 if(req.headers.get('Origin')!==u.origin)return json({error:'Origin not allowed'},403);
 try{const raw=await req.text();if(raw.length>400000)return json({error:'Profile too large'},413);const p=JSON.parse(raw);
 const invalid=validateProfile(p);if(invalid)return json({error:invalid},400);
 // Cloudflare may weaken ETags (W/"…") when it compresses responses; compare the opaque value.
 const old=await env.BUCKET.get('profile/travel-v1.json'),match=req.headers.get('X-Elsewhere-Revision')||req.headers.get('If-Match');if(normEtag(match)!==normEtag(old?.httpEtag||'"empty"'))return json({error:'Trip data changed in another window. Export your edits, then reload.'},409);const saved=await env.BUCKET.put('profile/travel-v1.json',JSON.stringify(p),{httpMetadata:{contentType:'application/json'},onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'}});if(!saved)return json({error:'A concurrent trip edit was saved. Export your edits, then reload.'},409);return new Response(JSON.stringify({saved:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','ETag':saved.httpEtag,'X-Elsewhere-Revision':normEtag(saved.httpEtag)}});
 }catch{return json({error:'Could not save travel profile'},500)}
}
