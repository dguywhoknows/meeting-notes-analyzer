/* A sample product meeting transcript and the minutes used when no model provider is configured. */
var SAMPLE_TRANSCRIPT = `[00:00:05] Priya: Okay, let's get started. Goal today is to decide whether the beta ships on the 21st. Marcus, where's engineering at?
[00:00:18] Marcus: Core flows are done. The two blockers are SSO and the onboarding checklist. SSO is honestly another two weeks, maybe more, the identity provider docs are a mess—
[00:00:34] Jen: Sorry to jump in, but do beta users actually need SSO? From the interviews, only one of the twelve design partners asked for it.
[00:00:45] Marcus: That's fair. If we cut SSO, the checklist alone is about four days.
[00:00:52] Tom: From a sales angle, Northwind is the one asking for SSO, and they're our biggest pilot. Um, I don't want to lose them.
[00:01:06] Priya: Could we give Northwind a manual invite flow for the beta and promise SSO in 1.1?
[00:01:14] Tom: I think they'd accept that if we put a date on it. I can, uh, talk to their IT lead this week.
[00:01:22] Priya: Great. So decision: beta ships on the 21st with the onboarding checklist, SSO moves to version 1.1. Any objections?
[00:01:31] Jen: No objection. I'd like to run three usability sessions on the checklist before launch though.
[00:01:38] Marcus: Works for me. I'll have a testable build by Wednesday.
[00:01:44] Jen: Then I'll book the sessions for Thursday and Friday.
[00:01:50] Priya: Perfect. Tom, can you confirm with Northwind by Friday and tell us if it's a dealbreaker?
[00:01:57] Tom: Yep, I'll confirm by Friday.
[00:02:01] Marcus: One risk, the analytics events aren't instrumented for the checklist yet. If we launch without them we won't know if it's working…
[00:02:12] Jen: Can we add the five core events? Started, each step, completed, skipped.
[00:02:19] Marcus: I can do that alongside the build, it's small.
[00:02:24] Priya: Okay. What's still open is pricing for beta users. Do we charge or not? Let's park that for next week.
[00:02:33] Tom: I'll bring two pricing options to that meeting.
[00:02:37] Priya: Thanks everyone. I'll send the recap.`;

var DEMO_MINUTES = {
  title: 'Beta launch go/no-go',
  summary: ['Engineering has finished the core flows; the remaining blockers are SSO (2+ weeks) and the onboarding checklist (~4 days).', 'Only 1 of 12 design partners requested SSO, but it is Northwind, the largest pilot.', 'The team agreed to ship the beta on the 21st without SSO and offer Northwind a manual invite flow.', 'Usability testing and analytics instrumentation were added to the launch plan.'],
  decisions: [{ text: 'Beta ships on the 21st with the onboarding checklist; SSO moves to v1.1.', quote: 'beta ships on the 21st with the onboarding checklist, SSO moves to version 1.1' }, { text: 'Northwind gets a manual invite flow during the beta.', quote: 'give Northwind a manual invite flow for the beta' }],
  action_items: [{ task: 'Deliver a testable build with the onboarding checklist', owner: 'Marcus', due: 'Wednesday', quote: "I'll have a testable build by Wednesday." }, { task: 'Run three usability sessions on the checklist', owner: 'Jen', due: 'Thursday–Friday', quote: "I'll book the sessions for Thursday and Friday." }, { task: 'Confirm with Northwind’s IT lead that SSO in v1.1 is acceptable', owner: 'Tom', due: 'Friday', quote: "I'll confirm by Friday." }, { task: 'Instrument the 5 core checklist analytics events', owner: 'Marcus', due: '', quote: 'I can do that alongside the build' }, { task: 'Prepare two pricing options for beta users', owner: 'Tom', due: 'next week', quote: "I'll bring two pricing options" }, { task: 'Send the meeting recap', owner: 'Priya', due: '', quote: "I'll send the recap." }],
  open_questions: ['Should beta users be charged?', 'Is SSO in v1.1 a dealbreaker for Northwind?'],
  risks: ['Launching without checklist analytics would leave success unmeasured.', 'Losing Northwind if the SSO delay is not accepted.'],
  next_agenda: ['Beta pricing decision (Tom’s two options)', 'Usability findings from Jen', 'Northwind SSO status'],
};
