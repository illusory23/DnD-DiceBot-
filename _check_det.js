function buildDetNotation(apiResult){
  // 优先使用后端分组信息（混合多重骰子，如 1d20+1d4+3）
  // 引擎要求单 @ 格式：骰子组用 + 连接，@ 后按骰子顺序排列全部结果
  if(apiResult.groups_detail && apiResult.groups_detail.length){
    // d100 单组：API返回单个值，但3D动画需要两个d10
    if(apiResult.groups_detail.length===1 && apiResult.groups_detail[0].sides===100){
      var v100=apiResult.groups_detail[0].rolls[0];
      var t100=Math.floor(v100/10)%10;
      var o100=v100%10;
      if(t100===0)t100=10;
      if(o100===0)o100=10;
      return '2d10@'+t100+','+o100;
    }
    var setParts=[],allVals=[];
    apiResult.groups_detail.forEach(function(g){
      setParts.push(g.rolls.length+'d'+g.sides);
      allVals=allVals.concat(g.rolls);
    });
    return setParts.join('+')+'@'+allVals.join(',');
  }
  // 旧路径（无分组信息）
  if(S===100){
    var total=apiResult.total;
    var tens=Math.floor(total/10)%10;
    var ones=total%10;
    if(tens===0)tens=10;
    if(ones===0)ones=10;
    return '2d10@'+tens+','+ones;
  }
  var sides=S;
  var rolls=apiResult.rolls||[];
  return rolls.length+'d'+sides+'@'+rolls.join(',');
}

function showResult
globalThis._testBuild = function(r,S){ return buildDetNotation(r); };