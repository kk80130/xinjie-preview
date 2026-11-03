(() => {
  'use strict';
  const story=document.getElementById('story');
  if(!story)return;
  const phrases=new Map([
    ['隐藏自己的意图','question-risk'],['信息差','question-risk'],['隐藏意图','question-risk'],
    ['视觉反馈','question-trust'],['信任判断','question-trust'],['风险感受','question-trust'],
    ['转账风险','flow-transfer'],['交易回应','flow-contact'],['游戏货币','question-cost'],
    ['点线面','visual-line'],['双球','visual-point'],['研究结论','research-plan'],['课程要求','course-process']
  ]);
  const expression=new RegExp([...phrases.keys()].sort((a,b)=>b.length-a.length).join('|'),'g');
  story.querySelectorAll('.story-lead,.concept-notes p,.process-records p,.visual-basis p,.visual-basis small').forEach(paragraph=>{
    const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const value=node.textContent;expression.lastIndex=0;let match,last=0;const fragment=document.createDocumentFragment();
      while((match=expression.exec(value))){
        fragment.append(document.createTextNode(value.slice(last,match.index)));
        const button=document.createElement('button');button.type='button';button.className='story-word';
        button.textContent=match[0];button.dataset.detail=phrases.get(match[0]);button.setAttribute('aria-haspopup','dialog');
        button.setAttribute('aria-label',`了解${match[0]}`);fragment.append(button);last=match.index+match[0].length;
      }
      if(last){fragment.append(document.createTextNode(value.slice(last)));node.replaceWith(fragment);}
    });
  });
})();
