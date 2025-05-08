const stripe = Stripe('pk_test_51RLShOEDhetaP7L8JUHPf9s5BDye8dsZg9lxpmB1ygPaMSGBPHENbIaYJGub5Xa8sORTgQokE8bYRxBVhnOLAFaC00ewaV15S4'); // 🔁 Replace with your real publishable key

document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('checkout-button');
  if (!button) return;

  button.addEventListener('click', async () => {
    try {
      const res = await fetch('/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const { id } = await res.json();
      if (id) {
        stripe.redirectToCheckout({ sessionId: id });
      } else {
        alert("Stripe checkout session failed.");
      }
    } catch (err) {
      console.error("Stripe error:", err);
      alert("Something went wrong with checkout.");
    }
  });
});
