const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const ROOT = path.join(__dirname, '..');
const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(__dirname, 'uploads');
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'change-me-123';
const WHATSAPP = process.env.WHATSAPP_NUMBER || '967712143144';

fs.mkdirSync(DATA, {recursive:true}); fs.mkdirSync(UPLOADS, {recursive:true});
app.use(cors()); app.use(express.json({limit:'2mb'})); app.use(express.urlencoded({extended:true}));
app.use('/uploads', express.static(UPLOADS));
app.use('/images', express.static(path.join(ROOT,'frontend/images')));
app.use(express.static(path.join(ROOT,'frontend')));

const dbFile = name => path.join(DATA, name + '.json');
function read(name){ try{return JSON.parse(fs.readFileSync(dbFile(name),'utf8'));}catch{return [];} }
function write(name,data){ fs.writeFileSync(dbFile(name),JSON.stringify(data,null,2),'utf8'); }
function id(prefix='id'){return prefix+'_'+Date.now().toString(36)+'_'+crypto.randomBytes(3).toString('hex');}
function admin(req,res,next){
  const token=req.headers.authorization?.replace('Bearer ','');
  if(!token || !global.adminTokens?.has(token)) return res.status(401).json({error:'غير مصرح'});
  next();
}
global.adminTokens=new Set();

app.get('/api/health',(req,res)=>res.json({ok:true,service:'OS Design Store API',time:new Date().toISOString()}));
app.get('/api/config',(req,res)=>res.json({whatsapp:WHATSAPP}));
app.get('/api/products',(req,res)=>{
  let products=read('products').filter(p=>p.active!==false);
  const q=(req.query.q||'').toLowerCase(); const cat=req.query.category;
  if(q) products=products.filter(p=>[p.title,p.titleEn,p.description].join(' ').toLowerCase().includes(q));
  if(cat && cat!=='all') products=products.filter(p=>p.category===cat);
  res.json(products);
});
app.get('/api/products/:id',(req,res)=>{const p=read('products').find(x=>x.id===req.params.id); p?res.json(p):res.status(404).json({error:'المنتج غير موجود'});});

app.post('/api/orders',(req,res)=>{
  const {customer,phone,email,productId,productTitle,notes}=req.body;
  if(!customer||!phone||!productTitle) return res.status(400).json({error:'الاسم ورقم الهاتف والمنتج مطلوبة'});
  const orders=read('orders'); const order={id:id('ORD'),customer,phone,email:email||'',productId:productId||'',productTitle,notes:notes||'',status:'new',createdAt:new Date().toISOString()};
  orders.unshift(order); write('orders',orders); res.status(201).json({message:'تم استلام الطلب',order});
});
app.get('/api/orders/track/:id',(req,res)=>{const o=read('orders').find(x=>x.id.toLowerCase()===req.params.id.toLowerCase()); o?res.json(o):res.status(404).json({error:'رقم الطلب غير موجود'});});
app.post('/api/messages',(req,res)=>{const {name,email,message}=req.body;if(!name||!message)return res.status(400).json({error:'الاسم والرسالة مطلوبة'});const a=read('messages');const item={id:id('MSG'),name,email:email||'',message,createdAt:new Date().toISOString()};a.unshift(item);write('messages',a);res.status(201).json({message:'تم إرسال رسالتك'});});

app.post('/api/admin/login',(req,res)=>{const {username,password}=req.body;if(username!==ADMIN_USER||password!==ADMIN_PASS)return res.status(401).json({error:'بيانات الدخول غير صحيحة'});const token=crypto.randomBytes(24).toString('hex');global.adminTokens.add(token);res.json({token});});
app.get('/api/admin/orders',admin,(req,res)=>res.json(read('orders')));
app.get('/api/admin/messages',admin,(req,res)=>res.json(read('messages')));
app.get('/api/admin/products',admin,(req,res)=>res.json(read('products')));
app.post('/api/admin/products',admin,(req,res)=>{const {title,titleEn,category,price,image,description,featured,active}=req.body;if(!title||!category)return res.status(400).json({error:'العنوان والتصنيف مطلوبان'});const a=read('products');const p={id:id('P'),title,titleEn:titleEn||title,category,price:Number(price)||0,image:image||'images/logo-01.svg',description:description||'',featured:Boolean(featured),active:active!==false};a.unshift(p);write('products',a);res.status(201).json(p);});
app.put('/api/admin/products/:id',admin,(req,res)=>{const a=read('products');const i=a.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'المنتج غير موجود'});a[i]={...a[i],...req.body,price:Number(req.body.price??a[i].price)};write('products',a);res.json(a[i]);});
app.delete('/api/admin/products/:id',admin,(req,res)=>{const a=read('products');const i=a.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'المنتج غير موجود'});a.splice(i,1);write('products',a);res.json({message:'تم حذف المنتج'});});
app.put('/api/admin/orders/:id/status',admin,(req,res)=>{const a=read('orders');const i=a.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'الطلب غير موجود'});a[i].status=req.body.status||'new';write('orders',a);res.json(a[i]);});

const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,UPLOADS),filename:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();cb(null,Date.now()+'-'+crypto.randomBytes(4).toString('hex')+ext);}});
const upload=multer({storage,limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>{cb(null,/^image\/(jpeg|png|webp|svg\+xml)$/.test(file.mimetype));}});
app.post('/api/admin/upload',admin,upload.single('image'),(req,res)=>{if(!req.file)return res.status(400).json({error:'اختر صورة صحيحة'});res.json({url:'/uploads/'+req.file.filename,filename:req.file.filename});});

app.get('*',(req,res)=>res.sendFile(path.join(ROOT,'frontend/index.html')));
app.listen(PORT,()=>console.log(`OS Design Store: http://localhost:${PORT}`));
