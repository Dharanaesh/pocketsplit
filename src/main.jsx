import React,{useEffect,useMemo,useState} from "react";
import {createRoot} from "react-dom/client";
import {Home,ReceiptText,Users,PieChart,Plus,ArrowDownLeft,ArrowUpRight,Wallet,X,ChevronRight,Search,Download,Upload,Settings,Trash2,CheckCircle2,CalendarDays,SlidersHorizontal} from "lucide-react";
import "./styles.css";

const KEY="pocketsplit-v1";
const cats=[["Food","🍜"],["Travel","🚕"],["Shopping","🛍️"],["Bills","🏠"],["Entertainment","🎬"],["Health","💊"],["Education","📚"],["Other","•••"]];
const initial={
 budget:25000,
 expenses:[
  {id:1,date:"2026-09-06",title:"Lunch",category:"Food",amount:420,method:"UPI",shared:false,people:[]},
  {id:2,date:"2026-09-06",title:"Cab to office",category:"Travel",amount:280,method:"UPI",shared:false,people:[]},
  {id:3,date:"2026-09-05",title:"Dinner with friends",category:"Food",amount:1600,method:"Card",shared:true,people:[{name:"Arun",share:400},{name:"Priya",share:400},{name:"Karthik",share:400}],myShare:400},
  {id:4,date:"2026-09-05",title:"Movie",category:"Entertainment",amount:750,method:"UPI",shared:true,people:[{name:"Arun",share:250},{name:"Priya",share:250}],myShare:250}
 ],
 people:[
  {id:1,name:"Arun",phone:"",balance:650},
  {id:2,name:"Priya",phone:"",balance:650},
  {id:3,name:"Karthik",phone:"",balance:400}
 ]
};

function load(){try{return JSON.parse(localStorage.getItem(KEY))||initial}catch{return initial}}
function money(n){return "₹"+Math.round(n).toLocaleString("en-IN")}
function day(d){return new Date(d+"T12:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
function App(){
 const [data,setData]=useState(load); const [tab,setTab]=useState("home"); const [modal,setModal]=useState(null);
 useEffect(()=>localStorage.setItem(KEY,JSON.stringify(data)),[data]);
 useEffect(()=>{if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{})},[]);
 const addExpense=e=>setData(d=>({...d,expenses:[e,...d.expenses]}));
 const deleteExpense=id=>setData(d=>({...d,expenses:d.expenses.filter(x=>x.id!==id)}));
 const settle=id=>setData(d=>({...d,people:d.people.map(p=>p.id===id?{...p,balance:0}:p)}));
 const month=new Date().toISOString().slice(0,7);
 const monthExpenses=data.expenses.filter(e=>e.date.startsWith(month));
 const spent=monthExpenses.reduce((s,e)=>s+e.amount,0);
 const owed=data.people.filter(p=>p.balance>0).reduce((s,p)=>s+p.balance,0);
 const owe=data.people.filter(p=>p.balance<0).reduce((s,p)=>s+Math.abs(p.balance),0);
 return <div className="app">
  <header><div><b className="brand">Pocket<span>Split</span></b><small>Your money, made simple.</small></div><button className="avatar">D</button></header>
  <main>
   {tab==="home"&&<HomeView spent={spent} budget={data.budget} owed={owed} owe={owe} expenses={monthExpenses} go={setTab} add={()=>setModal("expense")}/>}
   {tab==="expenses"&&<Expenses expenses={data.expenses} del={deleteExpense}/>}
   {tab==="splits"&&<Splits data={data} settle={settle}/>}
   {tab==="analytics"&&<Analytics expenses={monthExpenses} budget={data.budget}/>}
   {tab==="settings"&&<SettingsView data={data} setData={setData}/>}
  </main>
  <nav>{[[Home,"home","Home"],[ReceiptText,"expenses","Expenses"],[Users,"splits","Splits"],[PieChart,"analytics","Insights"]].map(([I,k,l])=><button className={tab===k?"active":""} onClick={()=>setTab(k)} key={k}><I size={20}/><span>{l}</span></button>)}</nav>
  <button className="fab" onClick={()=>setModal("expense")}><Plus/></button>
  {modal==="expense"&&<ExpenseModal people={data.people} onClose={()=>setModal(null)} onSave={e=>{
    const newPeople=e.people.map(x=>x.name);
    setData(d=>({...d,expenses:[e,...d.expenses],people:d.people.map(p=>newPeople.includes(p.name)?{...p,balance:p.balance+(e.people.find(x=>x.name===p.name)?.share||0)}:p)}));setModal(null)
  }}/>}
 </div>
}

function HomeView({spent,budget,owed,owe,expenses,go,add}){
 const pct=Math.min(100,spent/budget*100);
 return <section><p className="eyebrow">SEPTEMBER 2026</p><h1>Good morning 👋</h1>
 <div className="hero"><div><span>Spent this month</span><strong>{money(spent)}</strong><small>{Math.max(0,budget-spent).toLocaleString("en-IN")} left of {money(budget)} budget</small></div><Wallet/></div>
 <div className="progress"><i style={{width:pct+"%"}}/></div>
 <div className="grid2"><Balance icon={ArrowDownLeft} label="Owed to you" value={owed} positive onClick={()=>go("splits")}/><Balance icon={ArrowUpRight} label="You owe" value={owe} onClick={()=>go("splits")}/></div>
 <div className="sect"><h2>Recent expenses</h2><button onClick={()=>go("expenses")}>See all</button></div>
 <ExpenseList expenses={expenses.slice(0,5)}/>
 <button className="wide" onClick={add}><Plus size={18}/> Add expense</button>
 </section>
}
function Balance({icon:I,label,value,positive,onClick}){return <button className="balance" onClick={onClick}><div><I className={positive?"green":"red"}/><span>{label}</span><b>{money(value)}</b></div><ChevronRight size={17}/></button>}
function ExpenseList({expenses}){return <div className="list">{expenses.map(e=><div className="expense" key={e.id}><div className="cat">{cats.find(c=>c[0]===e.category)?.[1]}</div><div className="info"><b>{e.title}</b><span>{day(e.date)} · {e.category} · {e.method}</span></div><div className="amount"><b>{money(e.amount)}</b>{e.shared&&<small>Shared</small>}</div></div>)}</div>}

function Expenses({expenses,del}){
 const [q,setQ]=useState("");const [cat,setCat]=useState("All");
 const f=expenses.filter(e=>(cat==="All"||e.category===cat)&&e.title.toLowerCase().includes(q.toLowerCase()));
 const grouped=f.reduce((a,e)=>(a[e.date]??=[],a[e.date].push(e),a),{});
 return <section><div className="title"><div><p className="eyebrow">TRANSACTIONS</p><h1>Expenses</h1></div><button className="icon"><SlidersHorizontal/></button></div>
 <div className="search"><Search size={17}/><input placeholder="Search expenses" value={q} onChange={e=>setQ(e.target.value)}/></div>
 <div className="chips">{["All",...cats.map(x=>x[0])].map(x=><button className={cat===x?"sel":""} onClick={()=>setCat(x)} key={x}>{x}</button>)}</div>
 {Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([date,items])=><div className="daygroup" key={date}><h3><CalendarDays size={14}/>{day(date)}</h3><div className="list">{items.map(e=><div className="expense" key={e.id}><div className="cat">{cats.find(c=>c[0]===e.category)?.[1]}</div><div className="info"><b>{e.title}</b><span>{e.category} · {e.method}{e.shared?" · Shared":""}</span></div><div className="amount"><b>{money(e.amount)}</b><button onClick={()=>del(e.id)} title="Delete"><Trash2 size={15}/></button></div></div>)}</div></div>)}
 </section>
}

function Splits({data,settle}){
 return <section><p className="eyebrow">FRIENDS & SPLITS</p><h1>Balances</h1>
 <div className="net"><span>Net balance</span><strong>{money(data.people.reduce((s,p)=>s+p.balance,0))}</strong><small>Positive means friends owe you.</small></div>
 <div className="sect"><h2>People</h2></div><div className="people">{data.people.map(p=><div className="person" key={p.id}><div className="personAvatar">{p.name[0]}</div><div className="info"><b>{p.name}</b><span>{p.balance>0?"owes you":p.balance<0?"you owe":"settled"}</span></div><strong className={p.balance>=0?"green":"red"}>{money(Math.abs(p.balance))}</strong>{p.balance!==0&&<button className="settle" onClick={()=>settle(p.id)}><CheckCircle2 size={16}/> Settle</button>}</div>)}</div>
 <p className="tip">Tip: add a shared expense and choose the friends involved. Their balances update automatically.</p>
 </section>
}

function Analytics({expenses,budget}){
 const total=expenses.reduce((s,e)=>s+e.amount,0), groups=expenses.reduce((a,e)=>(a[e.category]=(a[e.category]||0)+e.amount,a),{});
 return <section><p className="eyebrow">INSIGHTS</p><h1>Analytics</h1><div className="stat"><span>Monthly spending</span><strong>{money(total)}</strong><small>{money(Math.max(0,budget-total))} remaining budget</small><div className="progress"><i style={{width:Math.min(100,total/budget*100)+"%"}}/></div></div>
 <div className="sect"><h2>By category</h2></div><div className="list">{Object.entries(groups).sort((a,b)=>b[1]-a[1]).map(([c,v])=><div className="catrow" key={c}><span className="cat">{cats.find(x=>x[0]===c)?.[1]}</span><b>{c}</b><div className="mini"><i style={{width:(v/Math.max(...Object.values(groups))*100)+"%"}}/></div><strong>{money(v)}</strong></div>)}</div></section>
}

function ExpenseModal({people,onClose,onSave}){
 const [f,setF]=useState({title:"",amount:"",category:"Food",method:"UPI",date:new Date().toISOString().slice(0,10),shared:false,people:[]});
 const [selected,setSelected]=useState([]);
 function submit(e){e.preventDefault();const amount=Number(f.amount);if(!f.title||!amount)return;const share=selected.length?amount/(selected.length+1):0;onSave({...f,id:Date.now(),amount,people:selected.map(name=>({name,share:Math.round(share)})),myShare:selected.length?Math.round(share):amount})}
 return <div className="overlay"><form className="sheet" onSubmit={submit}><div className="sheethead"><h2>Add expense</h2><button type="button" onClick={onClose}><X/></button></div>
 <label>Description<input autoFocus placeholder="Lunch, Uber, groceries..." value={f.title} onChange={e=>setF({...f,title:e.target.value})}/></label>
 <label>Amount<input type="number" inputMode="decimal" placeholder="₹ 0" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label>
 <div className="twocol"><label>Date<input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></label><label>Method<select value={f.method} onChange={e=>setF({...f,method:e.target.value})}><option>UPI</option><option>Cash</option><option>Card</option><option>Bank</option></select></label></div>
 <label>Category<select value={f.category} onChange={e=>setF({...f,category:e.target.value})}>{cats.map(([c])=><option key={c}>{c}</option>)}</select></label>
 <label className="check"><input type="checkbox" checked={f.shared} onChange={e=>setF({...f,shared:e.target.checked})}/> Split with friends</label>
 {f.shared&&<div className="friendselect"><span>Friends involved</span>{people.map(p=><label key={p.id}><input type="checkbox" checked={selected.includes(p.name)} onChange={e=>setSelected(e.target.checked?[...selected,p.name]:selected.filter(x=>x!==p.name))}/>{p.name}</label>)}</div>}
 {f.shared&&selected.length>0&&<div className="splitpreview">Each person: <b>{money(Number(f.amount)/(selected.length+1))}</b></div>}
 <button className="primary">Save expense</button></form></div>
}

function SettingsView({data,setData}){
 function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="pocketsplit-backup.json";a.click()}
 return <section><p className="eyebrow">PREFERENCES</p><h1>Settings</h1><div className="settings"><label>Monthly budget<input type="number" value={data.budget} onChange={e=>setData({...data,budget:Number(e.target.value)})}/></label>
 <button onClick={exportData}><Download/> Export backup</button><label className="import"><Upload/> Import backup<input type="file" accept=".json" onChange={e=>{const r=new FileReader();r.onload=()=>{try{setData(JSON.parse(r.result))}catch{alert("Invalid backup")}};r.readAsText(e.target.files[0])}}/></label>
 <button className="danger" onClick={()=>{if(confirm("Clear all app data?")){localStorage.removeItem(KEY);location.reload()}}}><Trash2/> Reset app</button></div></section>
}
createRoot(document.getElementById("root")).render(<App/>);