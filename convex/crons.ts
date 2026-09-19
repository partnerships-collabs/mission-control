import {cronJobs} from 'convex/server';
import {internal} from './_generated/api';
const crons=cronJobs();
// Recovers abandoned work and detects the Central calendar boundary. No Close
// API requests while idle on the same date; no LLM calls at any time.
crons.interval('revenue Close queue and calendar recovery',{minutes:1},internal.revenue.recoverCloseQueue,{});
export default crons;
