import { handlePayfastItn } from '../_shared/payfast-itn-handler.js';

Deno.serve(function (req) {
  return handlePayfastItn(req);
});
