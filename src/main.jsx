import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import'./styles.css';

const DAY=86400000;
const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr=()=>fmt(new Date());
const addDays=(dateStr,days)=>{const d=new Date(dateStr+'T00:00:00');d.setDate(d.getDate()+days);return fmt(d)};
const daysUntil=dateStr=>Math.round((new Date(dateStr+'T00:00:00')-new Date(todayStr()+'T00:00:00'))/DAY);
// overdue=已逾期 soon=三天内到期 ok=正常
const inspState=n=>{const d=daysUntil(n.nextDate);return d<0?'overdue':d<=3?'soon':'ok'};
const inspText=n=>{const d=daysUntil(n.nextDate);return d<0?`已逾期 ${-d} 天`:d===0?'今天到期':`${d} 天后到期`};

const seed=()=>({nodes:[
  {id:'gw',name:'核心路由器',type:'router',x:470,y:220,ip:'10.0.0.1',cycle:7,nextDate:addDays(todayStr(),-2),status:'normal'},
  {id:'sw1',name:'交换机 A',type:'switch',x:250,y:370,ip:'10.0.1.1',cycle:7,nextDate:addDays(todayStr(),2),status:'normal'},
  {id:'sw2',name:'交换机 B',type:'switch',x:690,y:370,ip:'10.0.2.1',cycle:14,nextDate:addDays(todayStr(),15),status:'normal'},
  {id:'web',name:'Web Server',type:'server',x:100,y:520,ip:'10.0.1.10',cycle:7,nextDate:todayStr(),status:'normal'},
  {id:'db',name:'Database',type:'server',x:400,y:550,ip:'10.0.1.20',cycle:30,nextDate:addDays(todayStr(),-5),status:'normal'},
  {id:'user',name:'办公终端',type:'device',x:820,y:530,ip:'10.0.2.22',cycle:7,nextDate:addDays(todayStr(),7),status:'normal'}
],edges:[['gw','sw1'],['gw','sw2'],['sw1','web'],['sw1','db'],['sw2','user']],records:[]});

const load=()=>{
  try{
    const d=JSON.parse(localStorage.getItem('topology'));
    if(!d||!Array.isArray(d.nodes))return seed();
    return{...d,nodes:d.nodes.map(n=>({cycle:7,nextDate:addDays(todayStr(),7),status:'normal',...n})),records:Array.isArray(d.records)?d.records:[]};
  }catch{return seed()}
};

const TYPE_ICON={router:'◉',switch:'▦',server:'▣',device:'▱'};

function App(){
  const[data,setData]=useState(load);
  const[selected,setSelected]=useState('gw');
  const[tool,setTool]=useState('select');
  const[notice,setNotice]=useState('');
  const[drag,setDrag]=useState(null);
  const board=useRef();
  useEffect(()=>localStorage.setItem('topology',JSON.stringify(data)),[data]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(t)},[notice]);

  const node=data.nodes.find(n=>n.id===selected)||data.nodes[0];
  const overdue=data.nodes.filter(n=>inspState(n)==='overdue');
  const soon=data.nodes.filter(n=>inspState(n)==='soon');
  const nodeRecords=node?(data.records||[]).filter(r=>r.nodeId===node.id):[];

  const updateNode=(k,v)=>{
    if(k==='status'&&v==='normal'&&node&&inspState(node)!=='ok'){
      setNotice(inspState(node)==='overdue'
        ?`「${node.name}」巡检已逾期，不能标为运行正常，请先完成本次巡检`
        :`「${node.name}」三天内到巡检期，不能标为运行正常，请先完成本次巡检`);
      return;
    }
    setData({...data,nodes:data.nodes.map(n=>n.id===selected?{...n,[k]:v}:n)});
  };

  // 完成本次巡检：按周期顺延到下一次日期（保证落在将来），并留下巡检记录
  const completeInspection=()=>{
    if(!node)return;
    let next=node.nextDate;
    do{next=addDays(next,node.cycle||7)}while(daysUntil(next)<=0);
    const rec={nodeId:node.id,name:node.name,doneDate:todayStr(),prevNext:node.nextDate,newNext:next};
    setData({...data,
      nodes:data.nodes.map(n=>n.id===node.id?{...n,nextDate:next}:n),
      records:[rec,...(data.records||[])]});
    setNotice(`「${node.name}」本次巡检已完成，下次巡检 ${next}`);
  };

  const addNode=()=>{const id='node'+Date.now();setData({...data,nodes:[...data.nodes,{id,name:'新设备',type:'device',x:500,y:300,ip:'192.168.0.10',cycle:7,nextDate:addDays(todayStr(),7),status:'normal'}]});setSelected(id);setTool('select');setNotice('已添加设备')};

  const connect=()=>{
    if(!selected)return;
    const from=data.nodes.find(n=>n.id===selected);
    const other=prompt('输入要连接的设备 ID（例如 sw1）');
    if(!from||!other||other===selected)return;
    const target=data.nodes.find(n=>n.id===other);
    if(!target||data.edges.some(e=>(e[0]===selected&&e[1]===other)||(e[1]===selected&&e[0]===other)))return;
    const blocked=[from,target].filter(n=>inspState(n)==='overdue');
    if(blocked.length){setNotice(`「${blocked.map(n=>n.name).join('、')}」巡检已逾期，不能经过这些设备新建连线`);return}
    setData({...data,edges:[...data.edges,[selected,other]]});
    setNotice('连接已创建');
  };

  const remove=()=>{setData({...data,nodes:data.nodes.filter(n=>n.id!==selected),edges:data.edges.filter(e=>!e.includes(selected))});setSelected(data.nodes.find(n=>n.id!==selected)?.id);setNotice('设备已删除')};
  const save=()=>setNotice('拓扑图已保存');
  const exportJson=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='network-topology.json';a.click();setNotice('JSON 已导出')};
  const validate=()=>{const linked=new Set(data.edges.flat());const isolated=data.nodes.filter(n=>!linked.has(n.id));setNotice(isolated.length?`发现 ${isolated.length} 个孤立节点`:'拓扑检查通过：没有孤立节点')};
  const move=e=>{if(!drag)return;const r=board.current.getBoundingClientRect();setData({...data,nodes:data.nodes.map(n=>n.id===drag?{...n,x:Math.max(35,e.clientX-r.left),y:Math.max(35,e.clientY-r.top)}:n)})};

  return <div className="app">
    <header>
      <div className="brand"><span className="brand-mark">⌁</span><div><strong>NETSCAPE</strong><small>TOPOLOGY STUDIO</small></div></div>
      <div className="file"><span className="dot"></span><div><strong>office-network.json</strong><small>最近保存：刚刚</small></div></div>
      <div className="insp-summary">
        {overdue.length>0&&<span className="pill overdue">⚠ 逾期 {overdue.length}</span>}
        {soon.length>0&&<span className="pill soon">临期 {soon.length}</span>}
        {overdue.length===0&&soon.length===0&&<span className="pill ok">巡检正常</span>}
      </div>
      <div className="top-actions"><button onClick={validate}>✓ 检查</button><button onClick={exportJson}>↓ 导出</button><button className="save" onClick={save}>保存更改</button></div>
    </header>
    <div className="toolbar">
      <div className="tool-group"><span>工具</span><button className={tool==='select'?'on':''} onClick={()=>setTool('select')}>↖ 选择</button><button className={tool==='connect'?'on':''} onClick={()=>{setTool('connect');connect()}}>⌁ 连接</button><button onClick={addNode}>＋ 设备</button></div>
      <div className="tool-group zoom"><button>−</button><span>100%</span><button>＋</button><button onClick={()=>setNotice('画布已居中')}>⌗</button></div>
    </div>
    <div className="workspace">
      <aside className="inventory">
        <div className="section-title"><span>巡检提醒</span><small>{overdue.length+soon.length} 台待处理</small></div>
        <div className="reminders">
          {overdue.length+soon.length===0&&<p className="reminder-empty">全部设备巡检正常</p>}
          {[...overdue,...soon].map(n=><button className={'reminder '+inspState(n)} onClick={()=>setSelected(n.id)} key={n.id}>
            <i className={n.type}>{TYPE_ICON[n.type]}</i>
            <span><strong>{n.name}</strong><small>{inspText(n)} · 周期 {n.cycle} 天</small></span>
            <b>›</b>
          </button>)}
        </div>
        <div className="section-title nodes-head"><span>设备库</span><small>{data.nodes.length} 个节点</small></div>
        <div className="device-types">{[['router','◉','路由器'],['switch','▦','交换机'],['server','▣','服务器'],['device','▱','终端设备']].map(([t,i,l])=><button onClick={()=>{const id='node'+Date.now();setData({...data,nodes:[...data.nodes,{id,name:l,type:t,x:500,y:320,ip:'192.168.0.2',cycle:7,nextDate:addDays(todayStr(),7),status:'normal'}]});setSelected(id)}} key={t}><i className={t}>{i}</i>{l}<span>＋</span></button>)}</div>
        <div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div>
        <div className="node-list">{data.nodes.map(n=><button className={selected===n.id?'sel':''} onClick={()=>setSelected(n.id)} key={n.id}>
          <i className={n.type}>{TYPE_ICON[n.type]}</i>
          <span><strong>{n.name}</strong><small>{n.ip}</small></span>
          {inspState(n)!=='ok'&&<em className={'tag '+inspState(n)}>{inspState(n)==='overdue'?'逾期':'临期'}</em>}
          <b>›</b>
        </button>)}</div>
      </aside>
      <section className="canvas-wrap">
        <div className="canvas" ref={board} onMouseMove={move} onMouseUp={()=>setDrag(null)}>
          {data.edges.map(([a,b],i)=>{const n1=data.nodes.find(n=>n.id===a),n2=data.nodes.find(n=>n.id===b);if(!n1||!n2)return null;const dx=n2.x-n1.x,dy=n2.y-n1.y,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)*180/Math.PI;const risk=inspState(n1)==='overdue'||inspState(n2)==='overdue';return <div className={'edge'+(risk?' risk':'')} key={i} style={{left:n1.x,top:n1.y,width:len,transform:`rotate(${ang}deg)`}}><span></span></div>})}
          {data.nodes.map(n=><button className={'node '+n.type+(selected===n.id?' picked':'')+(inspState(n)!=='ok'?' insp-'+inspState(n):'')} style={{left:n.x-42,top:n.y-31}} onMouseDown={e=>{e.stopPropagation();setSelected(n.id);setDrag(n.id)}} onClick={()=>setSelected(n.id)} key={n.id}>
            {inspState(n)!=='ok'&&<span className={'insp-badge '+inspState(n)}>{inspState(n)==='overdue'?'已逾期':'临期'}</span>}
            <i>{TYPE_ICON[n.type]}</i><strong>{n.name}</strong><small>{n.ip}</small>
          </button>)}
          <div className="legend"><span><i className="router"></i>路由器</span><span><i className="switch"></i>交换机</span><span><i className="server"></i>服务器</span><span><i className="risk-line"></i>巡检风险</span></div>
        </div>
        <div className="canvas-footer"><span>拖动节点调整位置 · {data.edges.length} 条连接{overdue.length?` · ${overdue.length} 台巡检逾期`:''}</span><span>坐标系：画布局部</span></div>
      </section>
      <aside className="inspector">
        <div className="section-title"><span>属性</span><small>{node?.type}</small></div>
        {node?<>
          <label>设备名称<input value={node.name} onChange={e=>updateNode('name',e.target.value)}/></label>
          <label>IP 地址<input value={node.ip} onChange={e=>updateNode('ip',e.target.value)}/></label>
          <label>设备类型<select value={node.type} onChange={e=>updateNode('type',e.target.value)}><option value="router">路由器</option><option value="switch">交换机</option><option value="server">服务器</option><option value="device">终端设备</option></select></label>
          <label>运行状态<select value={node.status||'normal'} onChange={e=>updateNode('status',e.target.value)}><option value="normal">运行正常</option><option value="watch">观察中</option><option value="down">停机维护</option></select></label>
          <div className="section-title insp-head"><span>巡检</span><small className={'insp-state '+inspState(node)}>{inspText(node)}</small></div>
          <label>巡检周期<select value={node.cycle} onChange={e=>updateNode('cycle',Number(e.target.value))}><option value={7}>每 7 天</option><option value={14}>每 14 天</option><option value={30}>每 30 天</option><option value={90}>每 90 天</option></select></label>
          <label>下次巡检日期<input type="date" value={node.nextDate} onChange={e=>updateNode('nextDate',e.target.value)}/></label>
          <button className="complete" onClick={completeInspection}>✓ 完成本次巡检（按周期顺延）</button>
          <div className="records">
            <div className="section-title"><span>巡检记录</span><small>{nodeRecords.length} 条</small></div>
            {nodeRecords.length===0&&<p className="reminder-empty">暂无巡检记录</p>}
            {nodeRecords.slice(0,5).map((r,i)=><div className="record" key={i}><strong>{r.doneDate} 完成</strong><small>下次 {r.newNext}</small></div>)}
          </div>
          <div className="inspector-actions"><button onClick={connect}>⌁ 添加连接</button><button className="danger" onClick={remove}>删除设备</button></div>
          <div className="connections">
            <div className="section-title"><span>连接</span><small>{data.edges.filter(e=>e.includes(node.id)).length} 条</small></div>
            {data.edges.filter(e=>e.includes(node.id)).map((e,i)=>{const other=data.nodes.find(n=>n.id===(e[0]===node.id?e[1]:e[0]));const risk=other&&inspState(other)==='overdue';return <div className="connection" key={i}><span className={'mini '+other?.type}></span><strong>{other?.name}</strong><small className={risk?'risk-text':''}>{risk?'巡检风险':'在线'}</small></div>})}
          </div>
        </>:<p>选择一个设备</p>}
      </aside>
    </div>
    {notice&&<div className="toast">{notice}</div>}
  </div>
}
createRoot(document.getElementById('root')).render(<App/>);
