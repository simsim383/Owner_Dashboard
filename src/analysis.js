// ═══════════════════════════════════════════════════════════════════
// ANALYSIS — v3. Review threshold 15%. WoW category comparison.
// Month = previous complete month. Clear shelf velocity logic.
// ═══════════════════════════════════════════════════════════════════
const EXCLUDED_REVIEW=["Tobacco"];
const EXCLUDED_HIDDEN=["Lottery"];
const REVIEW_THRESHOLD=15; // Flag items below 15% margin

function aggregateByBarcode(items){
  const map={};
  items.forEach(i=>{const key=i.barcode||i.product;if(!map[key])map[key]={...i,totalQty:0,totalGross:0,totalNet:0,totalProfit:null,daysSeen:0};const m=map[key];m.totalQty+=i.qty;m.totalGross+=i.gross;m.totalNet+=i.net;if(i.grossProfit!=null)m.totalProfit=(m.totalProfit||0)+i.grossProfit;m.daysSeen++;if(i.grossMargin!=null)m.avgMargin=i.grossMargin;});
  return Object.values(map).map(m=>{if(m.totalProfit!=null&&m.totalNet>0)m.avgMargin=(m.totalProfit/m.totalNet)*100;m.qty=m.totalQty;m.gross=m.totalGross;m.net=m.totalNet;m.grossProfit=m.totalProfit;m.grossMargin=m.avgMargin;return m;});
}

// Get previous week's data for WoW comparison
function getPrevWeekData(allDays,currentDays){
  const currentDates=new Set(currentDays.map(d=>d.dates?.start));
  const prevDays=allDays.filter(d=>!currentDates.has(d.dates?.start));
  if(!prevDays.length)return null;
  // Take the same number of days from before the current range
  const n=currentDays.length;
  return prevDays.slice(-n);
}

export function analyzeData(allDays,currentRange,timeRange,prevWeekDays){
  const isMultiDay=timeRange!=="Today";
  const items=isMultiDay?aggregateByBarcode(currentRange.items):currentRange.items;
  const tracked=items.filter(i=>i.hasCost);
  const untracked=items.filter(i=>!i.hasCost&&!EXCLUDED_HIDDEN.includes(i.category));
  const trackedProfit=tracked.reduce((s,i)=>s+(i.grossProfit||0),0);
  const trackedNet=tracked.reduce((s,i)=>s+i.net,0);
  const trackedMargin=trackedNet>0?(trackedProfit/trackedNet)*100:0;
  const totalGross=items.reduce((s,i)=>s+i.gross,0);
  const totalNet=items.reduce((s,i)=>s+i.net,0);
  const totalQty=items.reduce((s,i)=>s+i.qty,0);
  const untrackedRev=untracked.reduce((s,i)=>s+i.gross,0);

  const catMap={};
  items.forEach(i=>{if(!catMap[i.category])catMap[i.category]={name:i.category,gross:0,net:0,profit:0,qty:0,count:0,untracked:0,products:[]};const c=catMap[i.category];c.gross+=i.gross;c.net+=i.net;c.profit+=i.grossProfit||0;c.qty+=i.qty;c.count++;if(!i.hasCost&&!EXCLUDED_HIDDEN.includes(i.category))c.untracked++;c.products.push(i);});
  const categories=Object.values(catMap).map(c=>({...c,margin:c.net>0?(c.profit/c.net)*100:0,pctRev:totalGross>0?(c.gross/totalGross)*100:0,products:c.products.sort((a,b)=>b.qty-a.qty)})).sort((a,b)=>b.gross-a.gross);

  // WoW category comparison
  const catWoW={};
  if(isMultiDay&&prevWeekDays&&prevWeekDays.length>0){
    const prevItems=aggregateByBarcode(prevWeekDays.flatMap(d=>d.items));
    const prevCatMap={};
    prevItems.forEach(i=>{if(!prevCatMap[i.category])prevCatMap[i.category]={gross:0,qty:0,profit:0};const c=prevCatMap[i.category];c.gross+=i.gross;c.qty+=i.qty;c.profit+=i.grossProfit||0;});
    categories.forEach(cat=>{
      const prev=prevCatMap[cat.name];
      if(prev&&prev.gross>0){
        catWoW[cat.name]={
          prevGross:prev.gross,prevQty:prev.qty,prevProfit:prev.profit,
          grossChg:Math.round(((cat.gross-prev.gross)/prev.gross)*100),
          qtyChg:Math.round(((cat.qty-prev.qty)/prev.qty)*100),
          profitChg:prev.profit>0?Math.round(((cat.profit-prev.profit)/prev.profit)*100):null,
        };
      }
    });
  }

  // Top/bottom by QTY
  const catTopBottom={};
  categories.forEach(cat=>{const wc=cat.products.filter(p=>p.hasCost);const byQty=[...wc].sort((a,b)=>b.qty-a.qty);catTopBottom[cat.name]={top:byQty.slice(0,5),bottom:isMultiDay?[...wc].sort((a,b)=>a.qty-b.qty).slice(0,5):[]};});

  // Previous period items for trending comparison
  // prevWeekDays is now set for ALL modes: day=yesterday, week=prev 7 days, month=prev month
  let prevItems=[];
  if(prevWeekDays&&prevWeekDays.length>0){
    prevItems=aggregateByBarcode(prevWeekDays.flatMap(d=>d.items));
  }
  const prevMap={};prevItems.forEach(i=>{prevMap[i.barcode]=i;});

  // Trending: includes new products (no previous sales history) that sell 3+ units
  const trending=items.filter(i=>{const prev=prevMap[i.barcode];const isNew=!prev||prev.qty===0;if(isNew)return i.qty>=3&&i.hasCost&&(i.grossProfit||0)>0.5;return i.qty>=3&&prev.qty>0&&((i.qty-prev.qty)/prev.qty)>=0.4&&i.hasCost&&(i.grossProfit||0)>0.5;}).map(i=>{const prev=prevMap[i.barcode];const isNew=!prev||prev.qty===0;return{...i,prevQty:isNew?0:prev.qty,trendPct:isNew?999:Math.round(((i.qty-prev.qty)/prev.qty)*100)};}).sort((a,b)=>b.trendPct-a.trendPct).slice(0,15);

  // Review: below REVIEW_THRESHOLD%, EXCLUDES tobacco
  const review=tracked.filter(i=>!EXCLUDED_REVIEW.includes(i.category)).filter(i=>i.grossMargin!=null&&i.grossMargin<REVIEW_THRESHOLD&&i.grossMargin>=0&&i.qty>=1).sort((a,b)=>(a.grossMargin||0)-(b.grossMargin||0)).slice(0,20);
  const erosion=tracked.filter(i=>i.grossMargin!=null&&i.grossMargin<5).sort((a,b)=>(a.grossMargin||0)-(b.grossMargin||0)).slice(0,15);

  // Shelf density (monthly)
  const shelfDensity=isMultiDay?categories.filter(c=>c.profit>0||c.qty>0).map(c=>{const pp=trackedProfit>0?(c.profit/trackedProfit)*100:0;const vp=totalQty>0?(c.qty/totalQty)*100:0;const fr=c.name==="Tobacco"?3:c.name==="Lottery"?5:c.margin>=25?2:c.margin>=15?3:c.margin>=8?4:5;const d=vp>0?pp/(vp*fr/5):0;const st=d>=1.3?"ELITE":d>=0.7?"OK":"THIEF";return{cat:c.name,profitPct:Math.round(pp*10)/10,volumePct:Math.round(vp*10)/10,friction:fr,density:d,status:st,action:st==="ELITE"?"Expand":st==="OK"?"Maintain":"Shrink"};}).sort((a,b)=>b.density-a.density):[];

  // Clear the shelf — velocity drop logic
  const clearShelf=[];
  if(isMultiDay&&prevWeekDays&&prevWeekDays.length>0){
    const prevAgg=aggregateByBarcode(prevWeekDays.flatMap(d=>d.items));
    const prevBarcodeMap={};prevAgg.forEach(i=>{prevBarcodeMap[i.barcode]=i;});
    const currentDayCount=Math.max(1,new Set(currentRange.items.map(i=>i.report_date||"x")).size)||allDays.length;
    items.filter(i=>i.hasCost&&i.qty>0&&["Alcohol","Drinks","Snacks","Confectionery"].includes(i.category)&&i.gross/i.qty>=0.75).forEach(i=>{
      const prev=prevBarcodeMap[i.barcode];
      if(!prev||prev.qty<=0)return;
      const baseVel=prev.qty;const currVel=i.qty;
      if(currVel>=baseVel*0.4)return; // Not dropped enough
      const drop=Math.round(((baseVel-currVel)/baseVel)*100);
      const sellPrice=Math.round((i.gross/i.qty)*100)/100;
      const cost=i.grossProfit!=null?Math.round((sellPrice-(i.grossProfit/i.qty))*100)/100:null;
      if(!cost||cost<=0)return;
      const profit=Math.round((sellPrice-cost)*100)/100;
      // Calculate promo price
      let promoPrice=sellPrice;
      if(sellPrice>=5)promoPrice=Math.max(cost+0.01,sellPrice<=6?4.99:5.99);
      else if(sellPrice>=2.49)promoPrice=Math.max(cost+0.01,1.99);
      else if(sellPrice>=2)promoPrice=Math.max(cost+0.01,1.49);
      else if(sellPrice>=1.5)promoPrice=Math.max(cost+0.01,0.99);
      else if(sellPrice>=1)promoPrice=Math.max(cost+0.01,0.79);
      else promoPrice=Math.max(cost+0.01,Math.round(sellPrice*0.85*100)/100);
      promoPrice=Math.round(promoPrice*100)/100;
      const promoProfit=Math.round((promoPrice-cost)*100)/100;
      const beMult=promoProfit>0?Math.round((profit/promoProfit)*10)/10:99;
      const revenueOpp=Math.round((baseVel-currVel)*sellPrice*100)/100;
      if(beMult>3){
        clearShelf.push({product:i.product,category:i.category,baseVel,currVel,drop,sellPrice,cost,promoPrice:null,beMult:null,action:"DISPLAY",revenueOpp});
      }else{
        clearShelf.push({product:i.product,category:i.category,baseVel,currVel,drop,sellPrice,cost,promoPrice,beMult,action:"PROMOTE",targetVel:Math.round(currVel*beMult*10)/10,revenueOpp});
      }
    });
    clearShelf.sort((a,b)=>b.revenueOpp-a.revenueOpp);
  }

  const insights=genInsights({totalGross,trackedProfit,trackedMargin,untrackedRev,categories,erosion,trending,untracked,allDays,totalQty});
  const actions=genActions({untracked,erosion,categories,totalGross,trackedMargin,trending});

  return{summary:{totalGross,totalNet,totalQty,productCount:items.length,trackedProfit,trackedMargin,trackedCount:tracked.length,untrackedCount:untracked.length,untrackedRevenue:untrackedRev,estimatedHidden:untrackedRev*(trackedMargin/100||0.25),categoryCount:categories.length},categories,catWoW,trending,review,erosion,catTopBottom,shelfDensity,clearShelf,items,tracked,untracked,prevItems,insights,actions};
}

function genInsights({totalGross,trackedProfit,trackedMargin,untrackedRev,categories,erosion,trending,untracked,allDays,totalQty}){
  const ins=[];
  if(untrackedRev>0)ins.push({icon:"⚠️",text:`${((untrackedRev/totalGross)*100).toFixed(0)}% of revenue (£${Math.round(untrackedRev)}) has no cost data. Fix top 5 to recover ~£${Math.round(untrackedRev*(trackedMargin/100)*0.3)}.`,type:"problem"});
  const neg=erosion.filter(i=>(i.grossMargin||0)<0);
  if(neg.length>0)ins.push({icon:"🚨",text:`${neg.length} item${neg.length>1?"s":""} at negative margin. Check cost for ${neg[0].product}.`,type:"problem"});
  if(categories.length>0){const t=categories[0];ins.push({icon:"💰",text:`${t.name} is #1 — £${Math.round(t.gross)} (${t.pctRev.toFixed(0)}%), ${t.margin.toFixed(1)}% margin.`,type:"insight"});}
  const bm=[...categories].filter(c=>c.profit>0).sort((a,b)=>b.margin-a.margin)[0];
  if(bm&&bm.name!==categories[0]?.name)ins.push({icon:"📈",text:`${bm.name} has highest margin (${bm.margin.toFixed(1)}%) — expand range.`,type:"solution"});
  if(trending.length>0)ins.push({icon:"🔥",text:`${trending[0].product} trending${trending[0].trendPct===999?" — brand new!":" +"+trending[0].trendPct+"%"} — check stock.`,type:"insight"});
  if(allDays.length>=3){const dr=allDays.map(d=>({day:d.dates?new Date(d.dates.start+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long"}):"?",rev:d.items.reduce((s,i)=>s+i.gross,0)}));const bu=[...dr].sort((a,b)=>b.rev-a.rev)[0];const qu=[...dr].sort((a,b)=>a.rev-b.rev)[0];ins.push({icon:"📊",text:`Busiest: ${bu.day} (£${Math.round(bu.rev)}). Quietest: ${qu.day} (£${Math.round(qu.rev)}).`,type:"insight"});}
  return ins;
}

function genActions({untracked,erosion,categories,totalGross,trackedMargin,trending}){
  const acts=[];
  const au=untracked.filter(i=>!EXCLUDED_HIDDEN.includes(i.category));
  if(au.length>0){const t3=au.slice(0,3).map(i=>i.product).join(", ");acts.push({action:`Enter costs: ${t3}`,impact:`Recover £${Math.round(au.slice(0,3).reduce((s,i)=>s+i.gross,0)*(trackedMargin/100))} visibility`,priority:"HIGH",time:"10 min"});}
  const neg=erosion.filter(i=>(i.grossMargin||0)<0);
  if(neg.length>0)acts.push({action:`Check cost: ${neg[0].product} (negative margin)`,impact:"Stop selling at a loss",priority:"HIGH",time:"5 min"});
  if(trending.length>0){const t=trending[0];acts.push({action:`Check stock: ${t.product}${t.trendPct===999?" (new product)":" (+"+t.trendPct+"%)"}`,impact:"Don't miss sales",priority:"MED",time:"5 min"});}
  const lm=categories.filter(c=>c.margin>0&&c.margin<10&&c.gross>totalGross*0.05&&!EXCLUDED_REVIEW.includes(c.name));
  if(lm.length>0)acts.push({action:`Review pricing: ${lm[0].name} (${lm[0].margin.toFixed(1)}%)`,impact:"Improve margin",priority:"MED",time:"15 min"});
  return acts;
}

export { getPrevWeekData };
