# How abnormal events flow

Our understanding of the process and the two spreadsheets, written down so it
can be corrected. Everything here is inferred from the data itself.


## The process today

    +------------+        +--------------------+        +---------------+        +---------------+
    |    DTI     | notify |   Shared mailbox   |  reads |   A person    |  sends | Agency staff  |
    | IT Support | -----> |  "DOF IT Support"  | -----> |    relays     | -----> |  recipients   |
    |   Center   |        |                    |        | quotes the    |        |               |
    +------------+        +--------------------+        | original text |        +---------------+
                                                        +---------------+

    Into the mailbox    ~603 emails per week, of which ~2-10 are abnormal events
    Out to staff        ~2.7 notices relayed per week


## What each spreadsheet covers

    Additional Data Hackathon 2026 ....... the mailbox   (the second box above)
    goldsetdataset ....................... the notices   (the third and fourth boxes)

    Additional Data Hackathon 2026
      603 rows, two weeks: 26 Jul - 8 Aug 2026
      From, Subject, Received, Size, Categories
      No body text, subjects only
      7 of 603 tagged ABNORMAL EVENT
      Top sender is the IT Support Center, 420 of 603

    goldsetdataset
      226 unique notices, Jan 2025 - Aug 2026
      Date, Info, Sender
      Full body text, median 279 characters
      No subject lines anywhere
      All 226 are abnormal events
      296 blank rows and 70 duplicates removed from the original 592

    They reconcile. 7 over two weeks is 3.5 a week; 226 over 589 days is about
    2.7 a week. Both sit inside "two to ten per week".


## Where our system attaches

    +-------------------+     +-------------------+     +--------------------+
    | 1. Is it an       | --> | 2. What kind of   | --> | 3. Does a human    |
    |    abnormal event?|     |    event is it?   |     |    see it first?   |
    |                   |     |                   |     |                    |
    | a rule            |     | a classifier      |     | a rule             |
    | 6 of 7, and no    |     | 98% on the 226    |     | 71% held for       |
    | false alarms      |     |                   |     | review             |
    +-------------------+     +-------------------+     +--------------------+
      sits on the mailbox       sits on the notice        sits before sending

    Stage 1 learns from the 603 (it needs the ordinary emails as much as the
    abnormal ones). Stage 2 learns from the 226. Stage 3 is a rule, not a model.


## Please confirm or correct

    [ ]  DTI, as the State of Delaware IT Support Center, sends abnormal-event
         notifications into the shared DOF IT Support mailbox.
         Basis: 420 of 603 emails from that sender, and 6 of the 7 abnormal
         events share the subject "Abnormal Events Notification".

    [ ]  A person reads each one and relays it onward to agency staff, quoting
         the original content rather than rewriting it.
         Basis: confirmed by you, "outgoing but include the email content".

    [ ]  Roughly 2 to 10 abnormal events a week against about 600 total emails.
         Basis: both spreadsheets agree.

    [ ]  The Categories tags (Incident Monitoring, JAMS Monitoring, IRAS, RDP,
         Equipment) are your operational buckets for the whole mailbox, not a
         classification of abnormal events.
         Basis: only 7 of 15 tag values relate to abnormal events at all.

    [x]  SETTLED. Sender on file 1 is the person who RELAYED the message, not
         its author. Confirmed by Jay.

    [x]  SETTLED. Jay applied the Categories tags himself, so they are one
         person's judgement applied consistently. That is what makes them
         usable as ground truth.

    [x]  SETTLED. Incident tickets reporting an outage are NOT relayed - they
         are handled by the incident process. This is now a rule in the system:
         a subject carrying a ticket reference (INC, RITM, TASK, CHG) is
         excluded before anything else is considered.

    [x]  SETTLED. Follow-ups happen, but case by case rather than by rule, so
         threading is offered to the reviewer rather than applied automatically.

    [ ]  Jay reviews each email for "relevance to team tasks, trending, and
         communications needed", and weighs target audience, criticality and
         urgency. Our hold reasons are currently phrased around production
         scope and scheduling. Do those three criteria map onto what we hold,
         or are we holding for the wrong reasons?


## Two things worth knowing

    Abnormal events are about 1% of the mailbox. Seven notices hidden in 603 is
    a strong argument that they are easy to miss, and the clearest reason to
    automate the sorting rather than the writing.

    One subject line in that week reads "Scheduled IRAS Outage - Sunday, August
    2, 2926". A thousand-year typo, in live mail. We are keeping it as the
    example of why a person still approves anything that goes out.


## Open questions

    1.  ANSWERED by the incident-ticket rule. The emails mentioning outages
        that were not tagged abnormal are incident tickets, which are not
        relayed. With that rule in place the subject filter now finds all 7
        abnormal events out of 603 with zero false alarms.

    2.  Is 26 July - 8 Aug typical, or unusually busy?

    3.  Do the 226 notices carry a subject line anywhere? The spreadsheet has
        none, so we currently generate them.

    4.  When a follow-up IS needed, what decides it? We thread updates onto the
        original, but only a person can currently say that an update is one.


---
Everything above was derived from the two spreadsheets. Names, email addresses,
links and phone numbers were replaced with placeholders locally before any
processing, and the originals never left the machine.
