// Deliberately narrow entry point: do not import React observers, routes, or bootstrap here.
import { recordSentryBreadcrumb } from './configureSentry';
import { configureReporting } from './reportingRegistry';

configureReporting('entry');
recordSentryBreadcrumb('startup.router');
