import * as z from 'zod';

export const OrderRequestSchema = z.union([
  z.strictObject({ after: z.string().min(1) }),
  z.strictObject({ before: z.string().min(1) }),
  z.strictObject({ position: z.enum(['first', 'last']) }),
]);
export type OrderRequest = z.infer<typeof OrderRequestSchema>;

export const OrderBatchRequestSchema = z.strictObject({
  moves: z
    .array(
      z.strictObject({
        anchor: OrderRequestSchema,
        id: z.string().min(1),
      }),
    )
    .min(1),
});
export type OrderBatchRequest = z.infer<typeof OrderBatchRequestSchema>;

export type OrderEndpoints<TResource extends string> = {
  [P in `${TResource}/:id/order`]: {
    PATCH: {
      body: OrderRequest;
      params: { id: string };
      response: undefined;
    };
  };
} & {
  [P in `${TResource}/order:batch`]: {
    PATCH: {
      body: OrderBatchRequest;
      response: undefined;
    };
  };
};
