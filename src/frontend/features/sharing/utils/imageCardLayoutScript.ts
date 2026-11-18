/** Runs after fonts and images settle, identically in the preview and image capture. */
export const IMAGE_CARD_LAYOUT_SCRIPT = `
    var card=main.querySelector('[data-share-card-max-height]');
    if(card&&!card.hasAttribute('data-share-card-laid-out')){
      var maximum=Number(card.getAttribute('data-share-card-max-height'));
      var chrome=main.getBoundingClientRect().height-card.getBoundingClientRect().height;
      var limit=main.getBoundingClientRect().top+maximum-chrome;
      var last=null,marked=false;
      function heading(element){return /^H[1-6]$/.test(element.tagName)||element.classList.contains('share-card-meta');}
      function tailSpace(element){
        var space=0;
        for(var parent=element.parentElement;parent&&parent!==card;parent=parent.parentElement){
          var style=getComputedStyle(parent);space+=(parseFloat(style.paddingBottom)||0)+(parseFloat(style.borderBottomWidth)||0);
        }
        return space;
      }
      function leaf(element){
        if(element.matches('.code-block,.table-scroll,.export-image,.image-unavailable,.resource-card,.references,.formula-block,[data-export-formula],img,svg,math'))return true;
        if(element.matches('p,.plain-text,li'))return !element.querySelector('ul,ol,.code-block,.table-scroll,.export-image,[data-export-formula],img,math');
        return heading(element)||element.tagName==='HR';
      }
      function lastContent(element){
        if(heading(element))return null;
        if(leaf(element))return element;
        var children=Array.from(element.children);
        for(var index=children.length-1;index>=0;index--){var found=lastContent(children[index]);if(found)return found;}
        return null;
      }
      function appendEllipsis(element){
        var bottom=limit-tailSpace(element);
        if(element.matches('.code-block'))return fitCode(element,bottom);
        if(element.matches('.table-scroll'))return fitTable(element,bottom);
        if(!element.matches('p,.plain-text,li')||!leaf(element))return false;
        element.appendChild(document.createTextNode('…'));
        if(element.getBoundingClientRect().bottom>bottom&&!clamp(element,bottom-element.getBoundingClientRect().top))return false;
        marked=true;return true;
      }
      function clamp(element,available){
        var style=getComputedStyle(element);
        var lineHeight=parseFloat(style.lineHeight);
        var lines=Math.floor(available/lineHeight);
        if(!Number.isFinite(lines)||lines<1)return false;
        var target=element;
        if(element.tagName==='LI'){
          target=document.createElement('div');
          while(element.firstChild)target.appendChild(element.firstChild);
          element.appendChild(target);
        }
        target.style.display='-webkit-box';target.style.webkitBoxOrient='vertical';target.style.webkitLineClamp=String(lines);target.style.overflow='hidden';
        marked=true;
        return true;
      }
      function fitCode(element,bottom){
        var code=element.querySelector('pre code');if(!code)return false;
        var lines=code.textContent.trimEnd().split('\\n');
        var low=0,high=lines.length;
        while(low<high){
          var middle=Math.ceil((low+high)/2);
          code.textContent=lines.slice(0,middle).join('\\n')+' …';
          if(element.getBoundingClientRect().bottom<=bottom)low=middle;else high=middle-1;
        }
        code.textContent=lines.slice(0,low).join('\\n')+' …';
        if(low>0){marked=true;return true;}return false;
      }
      function fitTable(element,bottom){
        var table=element.querySelector('table');if(!table)return false;
        var rows=Array.from(table.rows),header=table.tHead?table.tHead.rows.length:0;
        while(rows.length>header&&element.getBoundingClientRect().bottom>bottom){rows.pop().remove();}
        while(rows.length>header){
          var cell=rows[rows.length-1].lastElementChild;
          var mark=document.createTextNode(' …');cell.appendChild(mark);
          if(element.getBoundingClientRect().bottom<=bottom){marked=true;return true;}
          mark.remove();rows.pop().remove();
        }
        return false;
      }
      function fit(container){
        var children=Array.from(container.children);
        for(var index=0;index<children.length;index++){
          var element=children[index];
          var rect=element.getBoundingClientRect();
          if(rect.bottom+tailSpace(element)<=limit){var complete=lastContent(element);if(complete)last=complete;continue;}
          var bottom=limit-tailSpace(element),kept=false;
          if(element.matches('.code-block'))kept=fitCode(element,bottom);
          else if(element.matches('.table-scroll'))kept=fitTable(element,bottom);
          else if(element.matches('p,.plain-text,li')&&leaf(element))kept=clamp(element,bottom-rect.top);
          else if(!leaf(element)&&element.children.length){fit(element);kept=Boolean(last&&element.contains(last));}
          if(kept){var retained=lastContent(element);if(retained)last=retained;}else element.remove();
          children.slice(index+1).forEach(function(tail){tail.remove();});
          break;
        }
      }
      if(main.getBoundingClientRect().height>maximum){
        fit(card);
        // Remove headings left without any following retained content, including author rows.
        Array.from(card.querySelectorAll('h1,h2,h3,h4,h5,h6')).reverse().forEach(function(element){
          if(!last||!(element.compareDocumentPosition(last)&Node.DOCUMENT_POSITION_FOLLOWING))element.remove();
        });
        Array.from(card.querySelectorAll('.markdown,.message-content,.message-row,.bubble,.bubble-column,.bubble-row,.document-section,.attachments,.details-content,ul,ol,details')).reverse().forEach(function(element){
          if(!element.textContent.trim()&&!element.querySelector('img,svg,math'))element.remove();
        });
        while(!marked&&last){
          if(appendEllipsis(last))break;
          var marker=document.createElement('p');marker.className='share-empty-excerpt';marker.textContent='…';last.after(marker);
          if(main.getBoundingClientRect().height<=maximum){marked=true;break;}
          marker.remove();last.remove();last=lastContent(card);
        }
        if(!marked){var marker=document.createElement('p');marker.className='share-empty-excerpt';marker.textContent='…';card.querySelector('article').appendChild(marker);}
        Array.from(card.querySelectorAll('h1,h2,h3,h4,h5,h6')).reverse().forEach(function(element){
          if(!last||!(element.compareDocumentPosition(last)&Node.DOCUMENT_POSITION_FOLLOWING))element.remove();
        });
        card.setAttribute('aria-label',card.getAttribute('data-share-card-omission')||'…');
      }
      card.setAttribute('data-share-card-laid-out','');
      if(main.getBoundingClientRect().height>maximum)throw new Error('Share card exceeds its height budget');
    }
`;
