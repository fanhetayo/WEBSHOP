"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
exports.object = object;
exports.string = string;
exports.uuid = uuid;
exports.proof = proof;
exports.checkoutInput = checkoutInput;
exports.gatewayStatus = gatewayStatus;
exports.equalHex = equalHex;
exports.integerMoney = integerMoney;
exports.verifyGatewayData = verifyGatewayData;
exports.buildSnapPayload = buildSnapPayload;
class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.HttpError = HttpError;
function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new HttpError(400, 'Format permintaan tidak valid.');
    return value;
}
function string(value, name, min = 1, max = 200) {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
        throw new HttpError(400, `${name} tidak valid.`);
    return value.trim();
}
function uuid(value) {
    const id = string(value, 'ID', 36, 36);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        throw new HttpError(400, 'ID tidak valid.');
    return id.toLowerCase();
}
function proof(value) {
    const text = string(value, 'Bukti akses', 64, 64);
    if (!/^[a-f0-9]{64}$/.test(text))
        throw new HttpError(400, 'Bukti akses tidak valid.');
    return text;
}
function checkoutInput(body) {
    const c = object(body.customer);
    const customer = { name: string(c.name, 'Nama', 2, 120), address: string(c.address, 'Alamat', 10, 1000), phone: string(c.phone, 'WhatsApp', 10, 15), note: string(c.note ?? '', 'Catatan', 0, 500) };
    if (!/^62\d{8,13}$/.test(customer.phone))
        throw new HttpError(400, 'Nomor WhatsApp tidak valid.');
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50)
        throw new HttpError(400, 'Keranjang tidak valid.');
    const seen = new Set();
    const items = body.items.map(v => {
        const i = object(v);
        const product_id = uuid(i.product_id);
        const variant = string(i.variant ?? '', 'Varian', 0, 100);
        if (typeof i.quantity !== 'number' || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99)
            throw new HttpError(400, 'Jumlah harus 1–99.');
        const key = product_id + '|' + variant;
        if (seen.has(key))
            throw new HttpError(400, 'Baris keranjang duplikat.');
        seen.add(key);
        return { product_id, variant, quantity: i.quantity };
    });
    return { customer, items, methodId: uuid(body.methodId) };
}
function gatewayStatus(data) {
    const status = data.transaction_status;
    if (data.status_code === '200' && (status === 'settlement' || (status === 'capture' && data.fraud_status === 'accept')) && (!data.fraud_status || data.fraud_status === 'accept'))
        return 'paid';
    if (status === 'refund' || status === 'chargeback')
        return 'refunded';
    // Missing chargeback amounts must stop fulfillment, not silently remain paid.
    if (status === 'partial_chargeback') {
        try {
            const amount = integerMoney(data.refund_amount);
            return amount > 0 && amount < integerMoney(data.gross_amount) ? 'partial_refund' : 'failed';
        }
        catch {
            return 'failed';
        }
    }
    if (status === 'partial_refund')
        return 'partial_refund';
    if (status === 'cancel')
        return 'cancelled';
    if (status === 'expire')
        return 'expired';
    if (status === 'deny' || status === 'failure')
        return 'failed';
    return 'pending';
}
function equalHex(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
function integerMoney(value) {
    const raw = String(value ?? '');
    if (!/^\d+(\.0{1,2})?$/.test(raw))
        throw new HttpError(400, 'Nominal pembayaran tidak valid.');
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0 || n > 1000000000)
        throw new HttpError(400, 'Nominal pembayaran tidak valid.');
    return n;
}
function verifyGatewayData(data, orderId, amount) {
    if (data.order_id !== orderId || (data.currency != null && data.currency !== 'IDR') || integerMoney(data.gross_amount) !== amount || typeof data.transaction_id !== 'string' || !data.transaction_id)
        throw new HttpError(409, 'Nominal/identitas pembayaran tidak cocok. Hubungi Admin.');
}
/** Build provider data only from the database order snapshot, never cart prices. */
function buildSnapPayload(order) {
    const clip = (value, size) => Array.from(value).slice(0, size).join('');
    const total = integerMoney(order.total_price);
    const shipping = integerMoney(order.shipping_fee);
    const item_details = order.items.map((item, index) => ({
        id: item.product_id + '-' + index,
        name: clip(item.title.replace(/\|/g, ' '), 50),
        price: integerMoney(item.unit_price),
        quantity: item.quantity,
    }));
    if (shipping > 0)
        item_details.push({ id: 'shipping', name: 'Ongkos kirim', price: shipping, quantity: 1 });
    if (total <= 0 || item_details.some(item => !Number.isInteger(item.quantity) || item.quantity < 1) || item_details.reduce((sum, item) => sum + item.price * item.quantity, 0) !== total) {
        throw new HttpError(409, 'Nominal pesanan server tidak konsisten. Hubungi Admin.');
    }
    const payload = {
        transaction_details: { order_id: order.gateway_order_id, gross_amount: total },
        item_details,
        credit_card: { secure: true },
        customer_details: {
            first_name: clip(order.customer_name, 255),
            phone: order.customer_phone,
            shipping_address: {
                first_name: clip(order.customer_name, 255),
                phone: order.customer_phone,
                address: clip(order.customer_address, 255),
                country_code: 'IDN',
            },
        },
    };
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 15000) {
        payload.item_details = [{ id: order.id, name: 'Produk pada pesanan ZYHA ID', price: total - shipping, quantity: 1 }];
        if (shipping > 0)
            payload.item_details.push({ id: 'shipping', name: 'Ongkos kirim', price: shipping, quantity: 1 });
    }
    return payload;
}
