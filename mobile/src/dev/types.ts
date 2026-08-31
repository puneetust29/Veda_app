// Route params for screens owned by dev/DevNavigator.tsx. Kept separate from
// the root types.ts so new dev screens never require touching production
// navigation types.
export type DevStackParamList = {
  Catalog: undefined;
  Detail: { id: string };
  StripePayment: undefined;
  DevMaps: undefined;
  DevTransport: undefined;
  DevUber: undefined;
};
