// Aliased in vite.config.ts to the encoder fumadocs-openapi uses for its own example requests.
declare module 'fumadocs-openapi/encode' {
  import type { useOperationContext, useRenderContext } from 'fumadocs-openapi/ui';

  type Example = ReturnType<typeof useOperationContext>['examples'][number];

  export function encodeRequestData(
    from: Example['data'],
    adapters: ReturnType<typeof useRenderContext>['mediaAdapters'],
    parameters: object[]
  ): Example['encoded'];
}
