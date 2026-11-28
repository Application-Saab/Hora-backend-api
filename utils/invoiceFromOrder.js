const COMPANY = {
  name: 'HORA SERVICES',
  address: '454, Ranka Colony Main, Muniventkatappa Layout, Bilekahalli, Bengaluru, Karnataka, Bangalore, India - 560076',
  email: 'dev@horaservices.com',
  phone: '+91 73385 84826',
  businessRegNo: 'BHOP23011758008171',
  pan: 'BEGPG1815Q'
};

const TERMS = [
  'If the order is cancelled more than 24 hours before the scheduled delivery: You will not receive refund of the advance payment. 3. If the order is cancelled within 24 hours: The full advance amount will be non-refundable, and 100% of the payment for decoration has to be paid by customer.',
  'Cancellation Policy:',
  '1. If the order is beyond 48 Hours: You are eligible for a 100% refund of the advance payment.',
  '2. If the order is cancelled more than 24 hours before the scheduled delivery: You will not receive refund of the advance payment.',
  '3. If the order is cancelled within 24 hours: The full advance amount will be non-refundable, and 100% of the payment for decoration has to be paid by customer.'
];

const ID_OFFSET = 10800;

// Order types (same list the app uses). The item title becomes e.g. "Decoration Services Delhi".
const ORDER_TYPES = {
  1: 'Decoration',
  2: 'Chef',
  3: 'Waiter',
  4: 'Bar Tender',
  5: 'Cleaner',
  6: 'Food Delivery',
  7: 'Live Catering',
  8: 'Photography'
};
const serviceTitle = type => (ORDER_TYPES[type] ? `${ORDER_TYPES[type]} Services` : 'Services');

// first non-empty value
const g = (o, ...keys) => {
  for (const k of keys) {
    const v = k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
};
const num = v => Number(v) || 0;

// Address document -> one clean line. Skips links (address2 is often a Google Maps link)
// and parts that are already inside a longer part (e.g. city inside address1).
const addressText = a => {
  if (!a) return '';
  if (typeof a === 'string') return a;
  const parts = [a.flat_no, a.house_no, a.address, a.address1, a.address_line1, a.address2, a.address_line2,
    a.landmark, a.locality, a.city, a.state, a.pincode]
    .map(x => (x == null ? '' : String(x).replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim()))
    .filter(x => x && !/^https?:\/\//i.test(x));
  return parts
    .filter((x, i) =>
      parts.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i &&
      !parts.some((y, j) => j !== i && y.length > x.length && y.toLowerCase().includes(x.toLowerCase())))
    .join(', ');
};

// "<div>- Arch of 300 balloons</div><div>- 4 frill curtain</div>" -> ["Arch of 300 balloons", "4 frill curtain"]
const htmlToLines = html =>
  String(html || '')
    .replace(/<\/(div|p|li)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map(s => s.replace(/^\s*[-•]\s*/, '').trim())
    .filter(Boolean);

// extra = { address, decorations }  (looked up by the route: order.addressId and order.items[].itemId)
function buildInvoice(order, customer, invoiceDate = new Date(), extra = {}) {
  const displayId = Number(order.order_id) + ID_OFFSET;
  const address = extra.address || null;
  // Decorations: already inside the order (items[].decoration) and/or looked up by the route.
  const decoById = new Map();
  [...(order.items || []).map(it => it.decoration), ...(extra.decorations || [])]
    .filter(d => d && typeof d === 'object')
    .forEach(d => decoById.set(String(d._id || d.name), d));
  const decos = [...decoById.values()];

  const total = num(g(order, 'total_amount', 'totalAmount', 'order_total', 'final_amount', 'amount', 'price'));
  const advance = num(g(order, 'advance_amount', 'advanceAmount', 'paid_amount', 'amount_paid', 'advance'));
  const remaining = g(order, 'remaining_amount', 'remainingAmount', 'balance_amount', 'balance') !== ''
    ? num(g(order, 'remaining_amount', 'remainingAmount', 'balance_amount', 'balance'))
    : Math.max(0, total - advance);

  const custName = g(order, 'customer_name', 'name', 'user_name') ||
    g(customer || {}, 'name', 'full_name', 'username') ||
    [g(customer || {}, 'firstName', 'first_name'), g(customer || {}, 'lastName', 'last_name')].filter(Boolean).join(' ');

  // Photography: true inclusions from the call checklist (raw photos/video are not shown on the invoice)
  const inc = (order.call_checklist && order.call_checklist.inclusions) || {};
  const includedFromChecklist = Object.keys(inc).filter(k => inc[k] === true && k !== 'Raw Photos' && k !== 'Raw Video');
  const explicit = g(order, 'inclusions', 'order_included');
  const baseIncluded = Array.isArray(explicit) && explicit.length ? explicit : includedFromChecklist;

  // Decoration: package inclusions + add-ons + custom inclusions
  const decoIncluded = decos.flatMap(d => (Array.isArray(d.inclusion) ? d.inclusion : [d.inclusion]).flatMap(htmlToLines));
  const addOns = (order.add_on || [])
    .filter(a => a && a.title)
    .map(a => `${String(a.title).trim()}${num(a.quantity) > 1 ? ` × ${a.quantity}` : ''}`);
  const custom = Array.isArray(order.customInclusion) ? order.customInclusion.map(String).filter(Boolean) : [];
  const includedList = [...baseIncluded, ...decoIncluded, ...custom]; // add-ons are shown separately

  // Comments can be plain text or HTML (<ol><li>…); keep them as clean lines.
  const rawComments = String(g(order, 'order_comments', 'decoration_comments', 'comments', 'note', 'notes') || '');
  const commentLines = htmlToLines(rawComments);
  const commentsOrdered = /<ol[\s>]/i.test(rawComments);

  // City comes from the order first, then from the saved address (so it is never empty if either has it)
  const city = g(order, 'order_city', 'city', 'order_locality') || g(address || {}, 'city', 'locality');
  const addressLine = addressText(address || g(order, 'billing_address', 'address', 'order_address', 'delivery_address'));

  return {
    invoiceNo: 'INV-' + displayId,
    invoiceDate, // the day the invoice was created, passed in by the route
    businessRegNo: COMPANY.businessRegNo,
    pan: COMPANY.pan,
    billedBy: { name: COMPANY.name, address: COMPANY.address, email: COMPANY.email, phone: COMPANY.phone },
    billedTo: {
      name: custName,
      address: addressLine,
      email: g(order, 'email', 'customer_email') || g(customer || {}, 'email'),
      phone: g(order, 'phone_no', 'phone') || g(customer || {}, 'phone', 'phone_no')
    },
    orderId: displayId,
    advance, remaining, total,
    itemTitle: [
      g(order, 'service_name', 'category_name', 'type_name') || serviceTitle(order.type),
      city
    ].filter(Boolean).join(' '),
    product: {
      name: g(order, 'product_name', 'productName', 'package_name', 'title') ||
        decos.map(d => d.name).filter(Boolean).join(', '),
      date: g(order, 'order_date'),
      city,
      address: addressLine,
      time: g(order, 'order_time', 'time_slot', 'timeSlot', 'start_time'),
      comments: commentLines,        // array of lines
      commentsOrdered,               // true when the source was a numbered list
      included: includedList,        // inclusions only
      addOns                         // add-ons only
    },
    terms: TERMS
  };
}

module.exports = { buildInvoice, ID_OFFSET };