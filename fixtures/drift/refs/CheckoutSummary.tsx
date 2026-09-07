import type { ReactNode } from "react";

export function Button(props: {
  variant?: string;
  size?: string;
  children?: ReactNode;
}) {
  return (
    <button type="button" data-variant={props.variant} data-size={props.size}>
      {props.children}
    </button>
  );
}

export function CheckoutSummary() {
  return (
    <div>
      <header>Checkout summary</header>
      <Button variant="primary" size="md">
        Pay now
      </Button>
    </div>
  );
}
