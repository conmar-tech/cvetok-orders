const ALLOWED_METHODS = ['POST', 'OPTIONS'];
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-07';
const CORS_ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN || '*';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS.join(','));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

function normaliseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    return JSON.parse(body);
  }
  return body;
}

function ensureConfigured() {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
    throw new Error('Shopify credentials are not configured');
  }
}

function formatPrice(cents) {
  if (typeof cents !== 'number') return undefined;
  return (cents / 100).toFixed(2);
}

function mapProperties(properties) {
  if (!properties || typeof properties !== 'object') return undefined;
  const entries = Object.entries(properties)
    .filter(([, value]) => value !== null && value !== undefined && `${value}`.trim() !== '');
  if (!entries.length) return undefined;
  return entries.map(([name, value]) => ({
    name,
    value: `${value}`
  }));
}

function mapLineItem(item) {
  if (!item) return null;

  const quantity = Number(item.quantity) || 1;
  const lineItem = { quantity };
  const properties = mapProperties(item.properties);
  if (properties) {
    lineItem.properties = properties;
  }

  if (item.variant_id) {
    lineItem.variant_id = item.variant_id;
  } else if (item.product_id) {
    lineItem.product_id = item.product_id;
    if (item.price) {
      lineItem.price = formatPrice(Number(item.final_price ?? item.price));
    }
    lineItem.title = item.product_title || item.title || 'Custom item';
  } else {
    // fall back to custom line item
    lineItem.title = item.product_title || item.title || 'Custom item';
    const price = Number(item.final_price ?? item.price);
    if (!Number.isNaN(price)) {
      lineItem.price = formatPrice(price);
    }
  }

  return lineItem;
}

function validatePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be a JSON object.');
    return errors;
  }

  const { customer = {}, cart = {} } = payload;
  if (!customer.name) errors.push('customer.name is required.');
  if (!customer.phone) errors.push('customer.phone is required.');
  if (!customer.email) errors.push('customer.email is required.');
  if (!customer.address) errors.push('customer.address is required.');

  if (!cart.items || !Array.isArray(cart.items) || cart.items.length === 0) {
    errors.push('cart.items must contain at least one item.');
  }

  return errors;
}

module.exports = async (req, res) => {
  setCors(res);

  if (!ALLOWED_METHODS.includes(req.method)) {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    ensureConfigured();
  } catch (error) {
    return sendJson(res, 500, { error: 'server_not_configured', message: error.message });
  }

  let payload;
  try {
    payload = normaliseBody(req.body);
  } catch (error) {
    return sendJson(res, 400, { error: 'invalid_json', message: error.message });
  }

  const validationErrors = validatePayload(payload);
  if (validationErrors.length) {
    return sendJson(res, 400, { error: 'invalid_payload', details: validationErrors });
  }

  const { customer, cart, context = {} } = payload;
  const lineItems = cart.items.map(mapLineItem).filter(Boolean);

  if (!lineItems.length) {
    return sendJson(res, 400, { error: 'invalid_payload', details: ['No valid line items were provided.'] });
  }

  const noteParts = [
    `Quote request from ${customer.name}`,
    customer.phone ? `Phone: ${customer.phone}` : null,
    customer.email ? `Email: ${customer.email}` : null,
    customer.comment ? `Comment: ${customer.comment}` : null
  ].filter(Boolean);

  const draftOrderPayload = {
    draft_order: {
      tags: 'quote-request',
      email: customer.email,
      note: noteParts.join(' | '),
      shipping_address: {
        name: customer.name,
        address1: customer.address,
        phone: customer.phone
      },
      billing_address: {
        name: customer.name,
        address1: customer.address,
        phone: customer.phone
      },
      note_attributes: [
        { name: 'request_source', value: context.source || 'request-quote-form' },
        { name: 'request_comment', value: customer.comment || '' }
      ],
      line_items: lineItems
    }
  };

  if (cart.note) {
    draftOrderPayload.draft_order.note_attributes.push({
      name: 'cart_note',
      value: cart.note
    });
  }

  try {
    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/draft_orders.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN
      },
      body: JSON.stringify(draftOrderPayload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Shopify API error', response.status, errorBody);
      return sendJson(res, 502, {
        error: 'shopify_error',
        status: response.status,
        message: 'Failed to create draft order.'
      });
    }

    const data = await response.json();
    return sendJson(res, 200, {
      success: true,
      draftOrderId: data?.draft_order?.id,
      invoiceUrl: data?.draft_order?.invoice_url
    });
  } catch (error) {
    console.error('Draft order creation failed', error);
    return sendJson(res, 500, { error: 'internal_error', message: error.message });
  }
};

