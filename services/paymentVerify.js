// services/paymentVerify.js
// "Instant" payments call this. Return true ONLY if you have confirmed that the TrxID
// really arrived in your merchant account for at least `amount`.
//
// By default it returns false, which means: the request is saved as Pending and an admin approves it.
// To get truly automatic instant payments, connect a payment gateway / SMS-forwarder / bKash merchant API
// here (e.g. UddoktaPay, RupantorPay, bKash Tokenized API) and return true when the payment is verified.
async function verifyTrx({ trxId, amount, method, senderNumber }) {
  return false;
}

module.exports = { verifyTrx };
