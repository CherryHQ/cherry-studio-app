// Deliberately narrow entry point: do not import React observers, routes, or bootstrap here.
import { configureSentry, recordSentryBreadcrumb } from './configureSentry';

void configureSentry();
recordSentryBreadcrumb('startup.router');
