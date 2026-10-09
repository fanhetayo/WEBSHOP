"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fulfillmentLabels = exports.orderLabels = exports.MAX_MONEY = exports.MAX_QUANTITY = exports.MAX_LINES = void 0;
exports.money = money;
exports.dateTime = dateTime;
exports.safeImageUrl = safeImageUrl;
exports.normalizePhone = normalizePhone;
exports.quantity = quantity;
exports.addCartLine = addCartLine;
exports.setCartQuantity = setCartQuantity;
exports.checkoutItems = checkoutItems;
exports.cartTotals = cartTotals;
exports.parseCart = parseCart;
exports.validateCustomer = validateCustomer;
exports.whatsappUrl = whatsappUrl;
exports.csvCell = csvCell;
exports.errorMessage = errorMessage;
exports.MAX_LINES = 50;
exports.MAX_QUANTITY = 99;
exports.MAX_MONEY = 1000000000;
function money(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
function dateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
}
function safeImageUrl(value) {
    if (typeof value !== 'string' || value.length > 2048)
        return '';
    try {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
    }
    catch {
        return '';
    }
}
function normalizePhone(value) {
    if (!/^[\d\s+()-]+$/.test(value))
        throw new Error('Nomor WhatsApp tidak valid.');
    let phone = value.replace(/\D/g, '');
    if (phone.startsWith('0'))
        phone = '62' + phone.slice(1);
    else if (phone.startsWith('8'))
        phone = '62' + phone;
    if (!/^62\d{8,13}$/.test(phone))
        throw new Error('Gunakan nomor WhatsApp Indonesia yang valid (08… atau 62…).');
    return phone;
}
function quantity(value) {
    if (!Number.isInteger(value) || value < 1 || value > exports.MAX_QUANTITY)
        throw new Error('Jumlah harus berupa bilangan bulat 1–99.');
    return value;
}
function addCartLine(cart, product, variant, count = 1) {
    quantity(count);
    if (!product.is_active)
        throw new Error('Produk sudah tidak tersedia.');
    if (product.variants.length && !product.variants.some(v => v.name === variant))
        throw new Error('Pilih varian produk terlebih dahulu.');
    if (!product.variants.length && variant)
        throw new Error('Varian tidak valid.');
    const total = cart.filter(x => x.product_id === product.id).reduce((s, x) => s + x.quantity, 0) + count;
    if (product.stock !== null && total > product.stock)
        throw new Error('Jumlah melebihi stok yang tersedia.');
    const found = cart.find(x => x.product_id === product.id && x.variant === variant);
    if (found)
        return cart.map(x => x === found ? { ...x, quantity: quantity(x.quantity + count) } : x);
    if (cart.length >= exports.MAX_LINES)
        throw new Error('Maksimal 50 baris produk dalam satu pesanan.');
    return [...cart, { product_id: product.id, variant, quantity: count, title: product.title, price: product.price, image: safeImageUrl(product.variants.find(v => v.name === variant)?.image || product.image_url || product.images[0]) }];
}
function setCartQuantity(cart, id, variant, count) {
    quantity(count);
    return cart.map(x => x.product_id === id && x.variant === variant ? { ...x, quantity: count } : x);
}
function checkoutItems(cart) {
    if (!cart.length || cart.length > exports.MAX_LINES)
        throw new Error('Keranjang kosong atau terlalu banyak produk.');
    return cart.map(x => ({ product_id: x.product_id, variant: x.variant, quantity: quantity(x.quantity) }));
}
function cartTotals(cart, fee = 0, freeMinimum = null) {
    const subtotal = cart.reduce((sum, x) => sum + x.price * x.quantity, 0);
    const shipping = subtotal > 0 && (freeMinimum === null || subtotal < freeMinimum) ? fee : 0;
    return { subtotal, shipping, total: subtotal + shipping };
}
function parseCart(raw) {
    try {
        const data = JSON.parse(raw || '[]');
        if (!Array.isArray(data) || data.length > exports.MAX_LINES)
            return [];
        const seen = new Set();
        return data.filter((x) => {
            if (!x || typeof x !== 'object' || typeof x.product_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.product_id) || typeof x.variant !== 'string' || x.variant.length > 100 || typeof x.title !== 'string' || x.title.length > 200 || !Number.isInteger(x.price) || x.price <= 0 || x.price > exports.MAX_MONEY || !Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > exports.MAX_QUANTITY)
                return false;
            const k = x.product_id + '|' + x.variant;
            if (seen.has(k))
                return false;
            seen.add(k);
            return true;
        }).map(x => ({ ...x, image: safeImageUrl(x.image) }));
    }
    catch {
        return [];
    }
}
function validateCustomer(value) {
    const customer = { name: value.name.trim(), address: value.address.trim(), phone: normalizePhone(value.phone), note: value.note.trim() };
    if (customer.name.length < 2 || customer.name.length > 120)
        throw new Error('Nama harus berisi 2–120 karakter.');
    if (customer.address.length < 10 || customer.address.length > 1000)
        throw new Error('Alamat lengkap harus berisi 10–1.000 karakter.');
    if (customer.note.length > 500)
        throw new Error('Catatan maksimal 500 karakter.');
    return customer;
}
function whatsappUrl(phone, message) {
    return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}
function csvCell(value) {
    let s = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(s))
        s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
}
exports.orderLabels = { pending: 'Menunggu pembayaran', paid: 'Lunas', cancelled: 'Dibatalkan', expired: 'Kedaluwarsa', failed: 'Gagal', refunded: 'Dikembalikan', partial_refund: 'Pengembalian sebagian' };
exports.fulfillmentLabels = { unfulfilled: 'Belum diproses', processing: 'Diproses', shipped: 'Dikirim', completed: 'Selesai' };
function errorMessage(error) {
    if (error && typeof error === 'object' && 'message' in error)
        return String(error.message);
    return typeof error === 'string' ? error : 'Terjadi kesalahan. Coba kembali.';
}
