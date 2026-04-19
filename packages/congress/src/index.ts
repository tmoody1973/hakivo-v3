/**
 * @hakivo/congress
 *
 * Congress.gov API client. v3.0 port of v2's `congress-api-client`.
 * See ./client.ts for the full implementation.
 */

export {
  createCongressClient,
  CongressApiError,
  type BillDetail,
  type BillListItem,
  type BillType,
  type CongressClient,
  type LawDetail,
  type LawListItem,
  type LawType,
} from "./client";

export { fetchCurrentLegislators, type Legislator } from "./legislators";
