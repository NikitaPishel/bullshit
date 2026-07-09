#type (structure)
#title (Checkout flow)

[Cart]
- User is on the cart page
- Item list and total

(Cart) -> [Checkout] {Clicks "Place order"}
- Shipping and payment form
- Field validation

(Checkout) -> [PaymentOK] {Payment succeeded}
- Funds charged successfully
- Reserve item in stock

(Checkout) -> [PaymentFailed] {Payment declined}
- Show decline reason
- Return to payment form

(PaymentOK) -> [OrderConfirmed]
- Confirmation email sent
- Create CRM record
  - Status: paid
  - Trigger warehouse notification

(PaymentFailed) -> [Checkout] {Retry attempt}
