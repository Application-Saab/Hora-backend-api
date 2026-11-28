const router = require('express').Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Order = require('../models/order');
const User = require('../models/user');
const InvoiceImage = require('../models/InvoiceImage');
const { buildInvoice, ID_OFFSET } = require('../utils/invoiceFromOrder');

// Invoice images live in  <project>/uploads/invoice-images/
// (index.js already serves /api/uploads from <project>/uploads)
const INVOICE_DIR = path.join(__dirname, '..', 'uploads', 'invoice-images');
fs.mkdirSync(INVOICE_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp)$/i.test(file.mimetype))
});

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseId = v => {
  const n = Number(v);
  return Number.isInteger(n) && n > ID_OFFSET ? n : null;
};

// Finds an already-registered model that has all the given fields (works whatever the model is named).
const modelWithPaths = (...paths) => {
  const name = mongoose.modelNames().find(n => paths.every(p => mongoose.model(n).schema.path(p)));
  if (!name) console.warn('[invoice] no model found with fields:', paths.join(', '));
  return name ? mongoose.model(name) : null;
};

// Product ids of an order: items[].itemId, items[].decoration and selecteditems.
const collectIds = order => {
  const idOf = v => (v && v._id ? v._id : v);
  return [...new Set(
    [
      ...(order.items || []).flatMap(i => [i.itemId, idOf(i.decoration)]),
      ...(order.selecteditems || [])
    ].filter(Boolean).map(String)
  )].filter(id => mongoose.isValidObjectId(id));
};

// Every registered model that has a name + inclusion field (decoration, photography, ...).
const productModels = () =>
  mongoose.modelNames()
    .map(n => mongoose.model(n))
    .filter(M => M.schema.path('name') && (M.schema.path('inclusion') || M.schema.path('inclusions')));

// Products of an order (decoration, photography, food package ...).
async function findProducts(order) {
  const ids = collectIds(order);
  if (!ids.length) return [];
  const models = productModels();

  let docs = (await Promise.all(models.map(M => M.find({ _id: { $in: ids } }).lean()))).flat();

  if (!docs.length) { // last resort: look in every collection by _id
    const db = mongoose.connection.db;
    const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));
    const cols = await db.listCollections().toArray();
    const found = await Promise.all(cols.map(c =>
      db.collection(c.name)
        .find({ _id: { $in: objectIds } }, { projection: { name: 1, title: 1, inclusion: 1, inclusions: 1 } })
        .toArray()
        .catch(() => [])
    ));
    docs = found.flat();
  }
  if (!docs.length) console.warn('[invoice] no product found for ids:', ids.join(', '));
  return docs;
}

// Builds the invoice data from the order + customer + address + products.
// Returns null if the order is not found.
// invoiceDate = the day the invoice was created (NOT the order's createdAt).
async function loadInvoice(shown, invoiceDate) {
  const internal = shown - ID_OFFSET;
  // order_id can be a number or a string
  const order = await Order.findOne({ order_id: { $in: [internal, String(internal)] } }).lean();
  if (!order) return null;

  const Address = modelWithPaths('address1', 'city');

  const [customer, address, decorations] = await Promise.all([
    order.fromId ? User.findById(order.fromId).lean() : null,
    Address && order.addressId ? Address.findById(order.addressId).lean() : null,
    findProducts(order)
  ]);

  return buildInvoice(order, customer, invoiceDate, { address, decorations });
}

// GET /api/invoices/debug/:orderId  (development only)
router.get('/debug/:orderId', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') return res.status(404).json({ message: 'Not found' });
  try {
    const shown = parseId(req.params.orderId);
    if (!shown) return res.status(400).json({ message: 'Enter a valid Order ID' });
    const internal = shown - ID_OFFSET;
    const order = await Order.findOne({ order_id: { $in: [internal, String(internal)] } }).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const products = await findProducts(order);
    const invoice = await loadInvoice(shown, new Date());
    res.json({
      orderType: order.type,
      items: order.items,
      selecteditems: order.selecteditems,
      idsUsed: collectIds(order),
      modelsChecked: productModels().map(M => M.modelName),
      productsFound: products.map(p => ({ _id: p._id, name: p.name || p.title, inclusion: p.inclusion ?? p.inclusions })),
      invoiceProduct: invoice && invoice.product
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/invoices?q=   -> saved invoices (search: customer name, order id, invoice no)
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const filter = {};
    if (q) {
      const rx = new RegExp(esc(q), 'i');
      filter.$or = [
        { customerName: rx },
        { invoiceNo: rx },
        { $expr: { $regexMatch: { input: { $toString: '$orderId' }, regex: esc(q) } } }
      ];
    }
    const docs = await InvoiceImage.find(filter)
      .select('orderId invoiceNo customerName total invoiceDate createdAt updatedAt')
      .sort({ createdAt: -1 }).limit(100).lean();
    res.json({ data: docs });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/invoices/order/:orderId   -> { invoice, image }
router.get('/order/:orderId', async (req, res) => {
  try {
    const shown = parseId(req.params.orderId);
    if (!shown) return res.status(400).json({ message: 'Enter a valid Order ID' });

    // Saved invoice keeps its original date; a brand-new one gets today's date.
    const saved = await InvoiceImage.findOne({ orderId: shown }).lean();
    const invoiceDate = saved ? (saved.invoiceDate || saved.createdAt) : new Date();

    const invoice = await loadInvoice(shown, invoiceDate);
    if (!invoice) return res.status(404).json({ message: 'No order found for this Order ID' });

    // Same file name is overwritten on "Regenerate", so ?v= stops the browser showing the old image.
    const version = saved && saved.updatedAt ? new Date(saved.updatedAt).getTime() : 0;
    res.json({
      data: {
        invoice,
        image: saved && saved.image ? `${saved.image}?v=${version}` : ''
      }
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/invoices/order/:orderId/image
// multipart field "file" = the PNG. Saved as uploads/invoice-images/invoice-<orderId>.png
// Same order -> same file name, so "Regenerate" overwrites the old image (no duplicates).
router.put('/order/:orderId/image', upload.single('file'), async (req, res) => {
  try {
    const shown = parseId(req.params.orderId);
    if (!shown) return res.status(400).json({ message: 'Enter a valid Order ID' });

    const inv = await loadInvoice(shown, new Date());
    if (!inv) return res.status(404).json({ message: 'No order found for this Order ID' });

    let image = '';
    if (req.file) {
      const ext = req.file.mimetype.includes('png') ? 'png'
        : req.file.mimetype.includes('webp') ? 'webp' : 'jpg';
      const fileName = `invoice-${shown}.${ext}`;
      const finalPath = path.join(INVOICE_DIR, fileName);
      const tmpPath = `${finalPath}.${Date.now()}.tmp`;

      // write to a temp file, then replace: a half-written image is never served
      await fs.promises.writeFile(tmpPath, req.file.buffer);
      await fs.promises.rename(tmpPath, finalPath);

      // if the extension changed (png -> jpg), remove the old file
      for (const e of ['png', 'jpg', 'webp']) {
        if (e !== ext) fs.promises.unlink(path.join(INVOICE_DIR, `invoice-${shown}.${e}`)).catch(() => {});
      }
      image = `invoice-images/${fileName}`;
    } else if (req.body && req.body.image) {
      // old way (only a file name) still works
      image = String(req.body.image);
      if (!/^(invoice-images\/)?[\w.-]+\.(png|jpg|jpeg|webp)$/i.test(image)) {
        return res.status(400).json({ message: 'Invalid image file name' });
      }
    }

    const set = {
      orderId: shown,
      invoiceNo: inv.invoiceNo,
      customerName: inv.billedTo.name || '',
      phone: inv.billedTo.phone || '',
      total: inv.total
    };
    if (image) set.image = image;

    const doc = await InvoiceImage.findOneAndUpdate(
      { orderId: shown },
      { $set: set, $setOnInsert: { invoiceDate: new Date() } }, // date fixed at creation
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ data: { orderId: doc.orderId, image: doc.image, invoiceDate: doc.invoiceDate } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;