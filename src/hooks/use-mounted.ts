import * as React from "react";

export function useMounted() {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this hook exists to flip false to true after mount
    setMounted(true);
  }, []);

  return mounted;
}
