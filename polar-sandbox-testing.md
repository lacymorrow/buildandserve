# Testing Polar Checkout in Sandbox Environment

## Setup Instructions

### 1. Create a Sandbox Account

1. Go to [sandbox.polar.sh](https://sandbox.polar.sh)
2. Create a dedicated user account and organization for testing
3. Navigate to Settings > Developer to create an API access token

### 2. Configure Your Local Environment

1. Add your sandbox access token to `.env.local`:

   ```
   POLAR_ACCESS_TOKEN=your_sandbox_access_token_here
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

2. Make sure the Polar configuration is set to use the sandbox server with the proper success URL:

   ```typescript
   // src/app/polar/config.ts
   export const polarConfig: CheckoutConfig = {
     accessToken: process.env.POLAR_ACCESS_TOKEN || "",
     successUrl: `${BASE_URL}/checkout/success?checkoutId={CHECKOUT_ID}&customer_session_token={CUSTOMER_SESSION_TOKEN}`,
     server: "sandbox", // Must be "sandbox" for testing
   };
   ```

### 3. Start Your Development Server

```bash
pnpm dev
```

## Testing the Checkout Flow

### Test Cards

Use these Stripe test cards in the sandbox environment:

| Card Number | Description |
|-------------|-------------|
| 4242 4242 4242 4242 | Successful payment |
| 4000 0000 0000 0002 | Declined payment |

Use any future expiration date, any 3-digit CVC, and any 5-digit ZIP code.

### Testing Steps

1. Navigate to your subscription page
2. Click on a subscription tier to initiate checkout
3. You should be redirected to `/polar/checkout?productPriceId=YOUR_TIER_ID`
4. The Polar checkout page should load properly
5. Complete the checkout using test card information
6. Verify that you're redirected to the success URL with parameters like:

   ```
   /checkout/success?checkoutId=1a87f038-8ce9-453e-abb6-3310d251ab85&customer_session_token=polar_cst_4xRrea4GxY0NVRgARJbljPU9NdtqfbnR9tyhK0lH3bR
   ```

### Success Page Behavior

The success page has been updated to support both Polar and Lemon Squeezy checkouts:

1. For Polar checkouts, it looks for the `checkoutId` parameter
2. For Lemon Squeezy checkouts, it looks for the `order_id` parameter
3. Based on which parameter is present, it processes the payment differently
4. Both payment processors will create a payment record with appropriate metadata
5. If a user is logged in, they'll be redirected to the dashboard
6. If not logged in, they'll be prompted to sign in

### Common Issues and Solutions

#### 401 Unauthorized Error

If you see: `"error": "invalid_token"`, it means your access token is:

- Not valid for the sandbox environment (make sure you're using a sandbox token, not a production one)
- Expired or revoked
- Malformed

Solution: Generate a new sandbox token at [sandbox.polar.sh](https://sandbox.polar.sh) and update your `.env.local` file.

#### Invalid Product ID

If the checkout fails with a product not found error, verify:

- The product exists in your sandbox organization
- You're using the correct product price ID
- The tier ID in the SubscriptionButton component matches a valid sandbox product

#### Debugging Network Requests

Use your browser's developer tools (F12 > Network tab) to monitor requests to:

- `https://sandbox-api.polar.sh/v1/checkouts/`

Check that headers include your valid sandbox access token.

## Integrating with Products

To test with specific products from your sandbox account:

1. Create products in your sandbox.polar.sh organization
2. Get the product price IDs from the sandbox dashboard
3. Update your subscription tiers to use those IDs

Example integration:

```tsx
// Example of defined tiers using sandbox product IDs
const SUBSCRIPTION_TIERS = {
  PRO: "sandbox-price-id-for-pro-tier",  
  TEAM: "sandbox-price-id-for-team-tier",
}

// Use in your component
<SubscriptionButton tier={SUBSCRIPTION_TIERS.PRO} />
```

## Additional Resources

- [Polar Sandbox Documentation](https://docs.polar.sh/integrate/sandbox)
- [Polar SDK Documentation](https://docs.polar.sh/integrate/sdk/adapters/nextjs)
- [Stripe Test Cards](https://stripe.com/docs/testing)
