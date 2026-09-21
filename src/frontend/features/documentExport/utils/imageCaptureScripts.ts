import type { ExportImageLayout } from '@/shared/contracts/documentExport';

import type { ImageCapturePlan } from './imageCapturePlan';
import { IMAGE_PAGE_HEIGHT, IMAGE_PAGE_TOP_INSET, type ImagePageSlice } from './imagePagePlan';

export function imageMeasurementScript(id: number, layout: ExportImageLayout) {
  return `(async function(){try{
    var main=document.querySelector('main');
    document.querySelectorAll('details').forEach(function(detail){detail.open=true;});
    ${layout === 'pages' ? `var style=document.createElement('style');style.textContent='main img:not(.print-logo){max-height:${IMAGE_PAGE_HEIGHT - 48}px;object-fit:contain}';document.head.appendChild(style);` : ''}
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(function(image){return image.decode();}));
    var previous=-1,stable=0,height=0;
    for(var frame=0;frame<120;frame++){
      await new Promise(requestAnimationFrame);
      height=Math.ceil(main.getBoundingClientRect().height);
      stable=height===previous?stable+1:0;previous=height;
      if(stable>=3)break;
    }
    if(stable<3)throw new Error('Layout unstable');
    var origin=main.getBoundingClientRect().top;
    var ink=[];
    function bounds(rect){return [Math.max(0,Math.floor(rect.top-origin)),Math.min(height,Math.ceil(rect.bottom-origin))];}
    if(${JSON.stringify(layout)}==='pages'){
      var walker=document.createTreeWalker(main,NodeFilter.SHOW_TEXT);
      var node;
      while(node=walker.nextNode()){
        if(!node.textContent.trim())continue;
        var range=document.createRange();range.selectNodeContents(node);
        Array.from(range.getClientRects()).forEach(function(rect){if(rect.width&&rect.height)ink.push(bounds(rect));});
      }
      main.querySelectorAll('img,math,svg,tr').forEach(function(element){
        var rect=element.getBoundingClientRect();
        if(!rect.width||!rect.height)return;
        if(element.tagName==='TR'){
          // Adjacent fractional row borders must not merge into one indivisible table.
          // Text ranges still protect glyphs at either edge of the row.
          if(rect.height<=${IMAGE_PAGE_HEIGHT})ink.push([Math.ceil(rect.top-origin),Math.floor(rect.bottom-origin)]);
        }else ink.push(bounds(rect));
      });
      var lines=ink.slice().sort(function(a,b){return a[0]-b[0];});
      main.querySelectorAll('h1,h2,h3,h4,h5,h6,.print-heading,.message-heading,thead').forEach(function(element){
        var rect=element.getBoundingClientRect();if(!rect.height)return;
        var heading=bounds(rect);
        var low=0,high=lines.length;
        while(low<high){var middle=(low+high)>>>1;if(lines[middle][0]<heading[1])low=middle+1;else high=middle;}
        var next=lines[low];
        if(next&&next[1]-heading[0]<${IMAGE_PAGE_HEIGHT})ink.push([heading[0],next[1]]);
      });
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},phase:'measure',height:height,width:main.scrollWidth,ink:ink}));
  }catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},error:true}));}})();true;`;
}

export function imagePageReadinessScript(
  id: number,
  index: number,
  width: number,
  slice: ImagePageSlice,
  plan: ImageCapturePlan,
  density: number,
  layout: ExportImageLayout,
  left = 0,
) {
  return `(async function(){try{
    document.documentElement.style.cssText='overflow:hidden;height:100%';
    document.body.style.cssText='overflow:hidden;height:100%;margin:0';
    var main=document.querySelector('main');
    var root=document.getElementById('export-page');
    if(!root){
      root=document.createElement('div');root.id='export-page';
      var clip=document.createElement('div');clip.id='export-page-content';
      document.body.appendChild(root);root.appendChild(clip);clip.appendChild(main);
    }
    var isPaged=${JSON.stringify(layout)}==='pages';
    var background=getComputedStyle(main).backgroundColor;
    root.style.cssText='position:absolute;left:0;top:0;overflow:hidden;width:${plan.width / plan.scale}px;height:${plan.layoutHeight}px;transform-origin:0 0;';
    root.style.background=background;
    root.style.zoom='${plan.scale / density}';
    var clip=document.getElementById('export-page-content');
    clip.style.cssText='position:relative;overflow:hidden;width:100%;height:${slice.height}px;';
    clip.style.top=isPaged?'${IMAGE_PAGE_TOP_INSET}px':'0';
    main.style.width='${width}px';main.style.maxWidth='none';main.style.margin='0';
    main.style.position='absolute';main.style.left='-${left}px';main.style.top='-${slice.top}px';
    for(var frame=0;frame<3;frame++)await new Promise(requestAnimationFrame);
    window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},phase:'ready',index:${index}}));
  }catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},error:true}));}})();true;`;
}
