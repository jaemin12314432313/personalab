import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let server, mountLandingMotion;
before(async () => {
  server = await createServer({ server:{middlewareMode:true,hmr:false}, appType:'custom' });
  ({mountLandingMotion} = await server.ssrLoadModule('/src/mockup/LandingMotion.ts'));
});
after(async () => { await server?.close(); });

function fixture(options, check) {
  const dom = new JSDOM('<section id="landing"><div class="lp-how"><div class="lp-section-heading">Heading</div></div><div class="lp-preview-surround"><a href="#sample">Sample</a></div><div class="lp-findings">Results</div></section>');
  const previous = Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{value:dom.window,writable:true,configurable:true});
  const listeners = new Set();
  const media = {matches:options.reduced || false,addEventListener(type,fn){listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);}};
  dom.window.matchMedia=()=>media;
  let observer, dispose;
  if(!options.unsupported) dom.window.IntersectionObserver=class {
    constructor(callback){if(options.broken)throw new Error('Unavailable');this.callback=callback;this.targets=new Set();this.disconnected=false;observer=this;}
    observe(target){this.targets.add(target);}
    unobserve(target){this.targets.delete(target);}
    disconnect(){this.disconnected=true;this.targets.clear();}
  };
  const landing=dom.window.document.getElementById('landing');
  try {dispose=mountLandingMotion(landing);check({dom,landing,media,listeners,getObserver:()=>observer,dispose});}
  finally {dispose?.();dom.window.close();if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;}
}

test('reduced motion and missing observation support leave content visible',()=>{
  for(const options of [{reduced:true},{unsupported:true},{broken:true}]) fixture(options,({landing,listeners})=>{
    assert.ok(!landing.classList.contains('lp-motion'));
    assert.equal(landing.querySelectorAll('.lp-reveal').length,0);
    assert.equal(listeners.size,0);
  });
});

test('visible sections reveal once and keyboard focus reveals an unreached section',()=>{
  fixture({},({dom,landing,listeners,getObserver,dispose})=>{
    const observer=getObserver(),heading=landing.querySelector('.lp-section-heading'),preview=landing.querySelector('.lp-preview-surround');
    assert.ok(landing.classList.contains('lp-motion'));
    assert.ok(!preview.classList.contains('is-visible'));
    observer.callback([{target:heading,isIntersecting:true},{target:preview,isIntersecting:false}]);
    assert.ok(heading.classList.contains('is-visible'));
    assert.ok(!observer.targets.has(heading));
    assert.ok(!preview.classList.contains('is-visible'));
    preview.querySelector('a').dispatchEvent(new dom.window.FocusEvent('focusin',{bubbles:true}));
    assert.ok(preview.classList.contains('is-visible'));
    assert.ok(!observer.targets.has(preview));
    dispose();
    assert.ok(observer.disconnected);
    assert.equal(listeners.size,0);
    assert.equal(landing.querySelectorAll('.lp-reveal').length,0);
    assert.ok(!landing.classList.contains('lp-motion'));
  });
});

test('enabling reduced motion during the visit immediately exposes remaining content',()=>{
  fixture({},({landing,media,listeners,getObserver})=>{
    media.matches=true;
    for(const listener of listeners)listener();
    assert.equal(landing.querySelectorAll('.lp-reveal:not(.is-visible)').length,0);
    assert.ok(getObserver().disconnected);
  });
});
