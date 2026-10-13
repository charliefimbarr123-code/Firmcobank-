const express = require('express');
const session = require('express-session');
const SQLiteStoreFactory = require('connect-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Set SESSION_SECRET to a random secret of at least 32 characters before production.');
}
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
const db = new Database(process.env.DB_FILE || path.join(DATA_DIR, 'firmco.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, phone TEXT NOT NULL, dob TEXT NOT NULL, address TEXT NOT NULL,
 city TEXT NOT NULL, zip TEXT NOT NULL, country TEXT NOT NULL, created_at TEXT NOT NULL
)`);
const SQLiteStore = SQLiteStoreFactory(session);
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: DATA_DIR }),
  name: 'firmco.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret-before-deploying-123456789',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 1000*60*60*8 }
}));
const authLimiter = rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
app.use('/api/auth', authLimiter);
const emailOK = s => typeof s === 'string' && s.length <= 254 && /^\S+@\S+\.\S+$/.test(s);
const textOK = (s, max=250) => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= max;
function publicUser(row) { return { name: row.name, email: row.email }; }
function requireAuth(req,res,next) { if(!req.session.userId) return res.status(401).json({error:'Please sign in first.'}); next(); }
app.get('/api/health', (req,res) => res.json({ok:true, service:'Firmco prototype API', mode:'prototype-only'}));
app.post('/api/auth/register', (req,res) => {
 const {name,email,phone,dob,address,city,zip,country,password}=req.body||{};
 if(!textOK(name,120)||!emailOK(email)||!textOK(phone,40)||!textOK(dob,10)||!textOK(address,250)||!textOK(city,100)||!textOK(zip,20)||!textOK(country,100)) return res.status(400).json({error:'Please complete all required fields with valid values.'});
 if(typeof password!=='string'||password.length<10||password.length>128) return res.status(400).json({error:'Password must be 10–128 characters.'});
 const birth=new Date(dob); const age=(Date.now()-birth.getTime())/(365.25*24*3600*1000);
 if(!Number.isFinite(birth.getTime())||age<18||birth>Date.now()) return res.status(400).json({error:'You must be 18 or older to register.'});
 const normalized=email.trim().toLowerCase();
 if(db.prepare('SELECT id FROM users WHERE email=?').get(normalized)) return res.status(409).json({error:'An account with this email already exists.'});
 const hash=bcrypt.hashSync(password,12);
 try {
   const result=db.prepare('INSERT INTO users(name,email,password_hash,phone,dob,address,city,zip,country,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(name.trim(),normalized,hash,phone.trim(),dob,address.trim(),city.trim(),zip.trim(),country,new Date().toISOString());
   req.session.regenerate(err=>{ if(err)return res.status(500).json({error:'Could not start a session.'}); req.session.userId=Number(result.lastInsertRowid); req.session.save(err2=>{if(err2)return res.status(500).json({error:'Could not save session.'});res.status(201).json({user:{name:name.trim(),email:normalized}});}); });
 } catch(e) { if(String(e.code)==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({error:'An account with this email already exists.'}); console.error('register failed'); return res.status(500).json({error:'Registration failed. Please try again.'}); }
});
app.post('/api/auth/login', (req,res) => {
 const {email,password}=req.body||{}; if(!emailOK(email)||typeof password!=='string'||password.length>128)return res.status(400).json({error:'Enter a valid email and password.'});
 const row=db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
 if(!row||!bcrypt.compareSync(password,row.password_hash))return res.status(401).json({error:'Invalid email or password.'});
 req.session.regenerate(err=>{if(err)return res.status(500).json({error:'Could not start a session.'});req.session.userId=row.id;req.session.save(err2=>{if(err2)return res.status(500).json({error:'Could not save session.'});res.json({user:publicUser(row)});});});
});
app.get('/api/auth/me', (req,res) => { if(!req.session.userId)return res.status(401).json({error:'Not signed in.'});const row=db.prepare('SELECT name,email FROM users WHERE id=?').get(req.session.userId);if(!row){req.session.destroy(()=>{});return res.status(401).json({error:'Session expired.'});}res.json({user:publicUser(row)}); });
app.post('/api/auth/logout', (req,res) => req.session.destroy(err=>{res.clearCookie('firmco.sid',{httpOnly:true,sameSite:'lax',secure:isProduction});if(err)return res.status(500).json({error:'Could not sign out.'});res.json({ok:true});}));
// Payment sandbox endpoint: no real payments. Requires Paystack TEST secret only.
app.post('/api/payments/initialize', requireAuth, async (req,res) => {
 const key=process.env.PAYSTACK_TEST_SECRET_KEY;
 if(!key||!key.startsWith('sk_test_'))return res.status(503).json({error:'Payment sandbox is not configured. Add a Paystack TEST secret key to .env; live keys are rejected.'});
 const amount=Number(req.body?.amount); const email=db.prepare('SELECT email FROM users WHERE id=?').get(req.session.userId)?.email;
 if(!Number.isInteger(amount)||amount<100||amount>50000000)return res.status(400).json({error:'Amount must be between 100 and 50,000,000 kobo.'});
 try { const r=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({email,amount,currency:'NGN',metadata:{environment:'firmco-prototype',user_id:req.session.userId}})});const data=await r.json();if(!r.ok||!data.status)return res.status(502).json({error:'Sandbox provider could not initialize this test transaction.'});res.json({authorization_url:data.data.authorization_url,reference:data.data.reference,mode:'test'}); }
 catch(e){res.status(502).json({error:'Payment sandbox is temporarily unavailable.'});}
});
// Static app served from the same origin so session cookies and API calls work.
app.use(express.static(path.join(__dirname)));
app.listen(PORT,()=>console.log(`Firmco prototype running on http://localhost:${PORT}`));
