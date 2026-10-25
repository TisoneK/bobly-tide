# Bobly Tide: Product Spec (v1)

**Bobly Tide is an online chama where every member puts in KES 1 an hour, and each hour the whole pot goes to one member, minus a small platform fee.** Members choose a package by group size. The group size sets how big the payout is and how long the wait for a turn is.

This spec covers WHAT the product is and how the business runs. HOW it gets built lives in the companion [`bobly-tide-build-spec.md`](bobly-tide-build-spec.md) (platform, MVP cut, architecture, data model, hourly engine, M-Pesa, visual identity).

---

## 1. Product definition

| Item | Definition |
|---|---|
| Name | Bobly Tide |
| Short form | Bobly (what most people will say) |
| Category | Online rotating savings group (chama) |
| Core promise | Put in one bob an hour. Get a lump sum when your turn comes. |
| Unit | KES 1 per member per hour |
| Package | A group size (number of members) |
| Platform revenue | A percentage fee on each hourly pot |
| Market | Kenya first, mobile-first, M-Pesa as the money rail |

**What it is not:** an investment, a loan product, or a return-earning savings account. A member gets back their own money minus the fee. The name, the marketing, and the app must never imply growth or profit.

**Tagline options:**
- *One bob. Every hour. Your turn.*
- *Every hour counts.*
- *Small drops, paid by the hour.*

---

## 2. Who it is for

| Segment | Need | Why Bobly Tide fits |
|---|---|---|
| Young earners and students | Save without feeling it | KES 24 a day is easy to commit to |
| Hustlers and small traders | Regular lump sums for stock or fees | Weekly or monthly payouts |
| Existing chama members | Digital, faster rotation | Hourly turns instead of monthly meetings |
| People who have never saved | A forced habit | The group makes it stick |

**Primary user for launch:** a mobile-money user aged 18 to 40 who already pays by M-Pesa daily and has tried and failed at saving alone.

---

## 3. The core mechanic

### 3.1 How an hour works

For a package of N members:

- Every active member contributes KES 1 for the hour
- Pot = KES N
- Platform fee = N × fee %
- Payout = N × (1 − fee %), credited to the member whose turn it is
- The next hour, the next member in order gets the turn

### 3.2 Cycle

- One cycle = N hours, so every member gets exactly one turn
- Over a cycle, a member pays in KES N and receives KES N minus the fee
- After the cycle ends, the group renews (same members, same order) or dissolves, as members choose

### 3.3 Turn order

- Fixed by join order within the group
- Visible to every member from the day the group starts
- No random draw in v1 (a paid-entry random draw may fall under betting and lottery rules, so it stays out until a lawyer clears it)

### 3.4 Group formation

- A group starts only when it is full
- Members choose a package and wait in that package's queue until enough people join
- Many groups of the same package run in parallel
- Every package shows a live "slots remaining" count before a member commits

---

## 4. Packages

### 4.1 Launch packages

| Package | Hourly pot | Fee at 5% | Payout | Turn every | Fee per group per day |
|---|---|---|---|---|---|
| **Daily (24 members)** | KES 24 | KES 1.20 | KES 22.80 | 1 day | KES 28.80 |
| **3-Day (72 members)** | KES 72 | KES 3.60 | KES 68.40 | 3 days | KES 86.40 |
| **Weekly (168 members)** | KES 168 | KES 8.40 | KES 159.60 | 7 days | KES 201.60 |

Naming the packages by wait time (Daily, 3-Day, Weekly) makes them instantly understandable to people who think in chama terms.

### 4.2 Later packages (once launch packages fill reliably)

| Package | Hourly pot | Payout at 5% | Turn every |
|---|---|---|---|
| Fortnight (336 members) | KES 336 | KES 319.20 | 14 days |
| Monthly (720 members) | KES 720 | KES 684.00 | 30 days |

### 4.3 What a member pays

Every member pays KES 24 a day in every package. The package only changes the wait and the lump-sum size.

---

## 5. Fees and revenue

### 5.1 Fee policy

- Launch fee: **5% of each hourly pot**, taken before the payout
- Flat across all packages at launch
- Shown on the package screen before joining and on every payout receipt
- No other fees in v1: no joining fee, no withdrawal fee charged by Bobly Tide (mobile-money network charges still apply and must be shown)

The 5% is a planning assumption. It is the first decision to confirm.

### 5.2 Revenue math

The platform earns KES 0.05 per member per hour, which is KES 1.20 per member per day, whatever the package.

| Active members | Revenue per hour | Per day | Per 30 days |
|---|---|---|---|
| 120 (pilot: 5 Daily groups) | KES 6 | KES 144 | KES 4,320 |
| 1,000 | KES 50 | KES 1,200 | KES 36,000 |
| 10,000 | KES 500 | KES 12,000 | KES 360,000 |
| 100,000 | KES 5,000 | KES 120,000 | KES 3.6M |

Revenue depends on active members only. Package mix does not change it. The
pilot is about proving the mechanic, not revenue.

### 5.3 Fee options to test later

- Lower fee on bigger packages to reward longer waits and help them fill
- A small flat monthly membership alongside the percentage
- Premium tiers with a higher hourly contribution (KES 2, 5, or 10 an hour) as separate packages
- A tiny one-time **join fee** (KES 1–5, once per account), refunded if the group never forms or verification fails. Kept out of v1 (§5.1) so the "one bob" promise holds; a KES 20+ fee is explicitly ruled out as it breaks that promise and reads as a scam pattern.

---

## 6. Member journey

1. **Discover:** a friend referral, WhatsApp share, or social ad
2. **Sign up:** phone number and one-time code, with ID verification at the stage the law requires
3. **Pick a package:** Daily, 3-Day, or Weekly, with slots remaining and fee shown
4. **Fund the wallet:** a prepayment by M-Pesa (daily, weekly, or monthly top-up)
5. **Wait for the group to fill:** a queue screen with progress and an estimated start
6. **Group starts:** the member sees their turn position and the full order
7. **Hourly ticks:** KES 1 is debited from the wallet each hour, with a quiet receipt
8. **Turn arrives:** payout lands in the wallet, and the member gets a notification
9. **Withdraw:** to M-Pesa, once the wallet passes the withdrawal minimum
10. **Cycle ends:** renew, switch package, or leave

---

## 7. Money rules

| Rule | Definition |
|---|---|
| Wallet | Each member has a wallet balance inside Bobly Tide |
| Top-ups | Members prefund in whole-shilling amounts, with a minimum (suggested KES 24 for a day) |
| Hourly debit | KES 1 an hour from the wallet while the member is active |
| Payout | Credited to the wallet at the member's turn |
| Withdrawal | To the member's own M-Pesa number only |
| Withdrawal minimum | A set minimum (suggested KES 50) so network charges do not swallow small amounts |
| Fee accounting | Fractions of a shilling are tracked exactly and settled to the organization daily |
| Receipts | Every debit, payout, and fee is visible in the member's history |

---

## 8. Risk rules

### 8.1 Early-turn risk

A member whose turn comes in hour 1 of a 168-member group has received KES 159.60 after paying KES 1. If they quit, the group absorbs the gap.

**Rule:** a member holds a security balance that always covers the contributions they still owe. The hold is released as the cycle runs. Members in later positions need less hold, and members in early positions need more.

### 8.2 Empty wallet

- Wallet low: warning notifications by SMS and app
- Wallet empty: a short grace period (suggested 6 hours) before the member is in default
- Default: the security hold covers the missing hours, and the member is removed from the next cycle

### 8.3 Dropouts

- The hold covers the remaining hours so the pot stays whole
- The open slot is filled from the package queue
- A dropped member's unreceived turn is forfeited, and any remaining wallet balance is returned minus what they owe

### 8.4 Fill time

- Show slots remaining and estimated start time
- Auto-merge partial groups of the same package where possible
- A member can switch package while waiting at no cost

### 8.5 Fraud and abuse

- One account per phone number and ID
- Limits on how many groups one person can join at the same time
- Flags for accounts that join, take an early turn, and default
- Referral rewards paid only after the referred member completes a cycle

---

## 9. Trust

Trust is the product. Kenyans have been burned by pyramid schemes and fake investment groups, so Bobly Tide must look and behave like the opposite.

- A plain-language **"How it works"** page with the exact numbers and the fee
- A visible **public ledger of groups**: total members, hours run, payouts made
- **Named officials and registered company details** on the site and in the app
- **Funds held with a licensed partner** (bank or licensed payment provider), with that partner named
- A written **member agreement and constitution**
- **No promises of returns**, in the app, ads, or by agents
- A **simple dispute process** with a human response inside 24 hours
- An **explanation of the early-turn rule**, so no one feels cheated by someone else's early payout

---

## 10. Legal and regulatory position

This section lists what needs a lawyer's confirmation. It is not legal advice.

| Area | Question to settle |
|---|---|
| Holding member money | Does a wallet need a Central Bank of Kenya payment service provider licence, or can a licensed partner hold the funds? |
| Chama status | Can each group register or operate as a chama, with Bobly Tide as a service provider to it? |
| Pooled money from the public | Does collecting funds from many strangers trigger SACCO or deposit-taking rules? |
| Fixed turn order | Confirm it falls outside betting and lottery law (and keep random draws out until cleared) |
| Data | Registration with the Office of the Data Protection Commissioner, and a privacy policy under the Data Protection Act |
| Anti-money-laundering | ID verification, transaction monitoring, and reporting duties |
| Company | Registration through BRS, and a tax registration with KRA |
| Trademark | KIPI search and filing for "Bobly Tide" in the finance and payments classes |

**Recommended stance for v1:** operate through a licensed payment partner that holds the money, keep marketing language free of returns, and get a written legal opinion before taking real member funds.

---

## 11. Brand

- **Name:** Bobly Tide. Lead with "Bobly" in the logo and handles, since "Bobly" alone is popular but the combined name is distinctive.
- **Idea:** small drops (one bob) become a tide (the group pot) that moves through the group hour by hour.
- **Voice:** friendly, plain, and direct. Short sentences, no finance jargon, no hype.
- **Say:** "your turn", "your group", "one bob an hour".
- **Avoid:** "returns", "profit", "invest", "earn", "interest", "bank".
- **Languages:** English and Swahili, with Sheng in social content.

**Name checks before launch:**
1. Domains: boblytide.com, boblytide.co.ke
2. Handles: @boblytide on Instagram, X, and TikTok
3. KIPI trademark search for "Bobly Tide"
4. BRS business name search
5. App Store and Google Play

---

## 12. Operations and people

| Function | What it does |
|---|---|
| **Support** | WhatsApp, in-app chat, and a phone line; replies within 24 hours, faster for money issues |
| **Group care** | Watches groups that are slow to fill, and nudges members in queue |
| **Risk and collections** | Handles defaults, security holds, and disputes |
| **Finance** | Daily fee settlement, reconciliation with the partner, and monthly reports |
| **Compliance** | Licences, ID verification, reporting, and privacy |
| **Community and growth** | Referrals, agents, WhatsApp groups, and partnerships with existing chamas |
| **Partnerships** | The licensed money partner, the mobile-money provider, and SMS provider |

**Starting team:** a product owner, one operations and support lead, one risk and finance person, and one growth lead, plus outside legal counsel.

---

## 13. Launch plan

| Phase | Scope | Goal |
|---|---|---|
| **0. Setup** | Name checks, trademark filing, company registration, legal opinion, partner agreement | Cleared to hold member money |
| **1. Closed pilot** | One package (Daily, 24 members), 3 to 5 groups of invited people | Prove the hourly rhythm, test defaults and withdrawals |
| **2. Limited launch** | Daily, 3-Day, and Weekly packages, invite-only growth | Prove groups fill and members complete cycles |
| **3. Public launch** | Open sign-up, referrals, ads | Reach the first 10,000 active members |
| **4. Expansion** | Fortnight and Monthly packages, higher-contribution tiers | Raise revenue per member |

---

## 14. Success measures

| Measure | Why it matters |
|---|---|
| Active members | Revenue depends on it directly |
| Time for a group to fill | The main churn risk |
| Cycle completion rate | Shows trust and fit |
| Default rate | Shows the risk rules work |
| Share of members who renew | Shows the habit sticks |
| Wallet top-up frequency | Shows engagement |
| Support response time | Trust signal |
| Cost to acquire a member vs 30-day fee revenue (about KES 36 per member) | Shows whether growth pays |

---

## 15. Biggest risks

| Risk | Why | Response |
|---|---|---|
| **Regulation** | Holding pooled public money is regulated | Licensed partner, legal opinion first |
| **Trust** | Scheme fears, past scams | Transparency, named officials, no return claims |
| **Slow-filling groups** | Members leave while waiting | Smaller starting packages, auto-merge, live slot counts |
| **Defaults after early turns** | Group loses money | Security hold covers remaining contributions |
| **Thin revenue per member** | KES 1.20 a day per member at 5% | Volume focus, higher tiers, lower acquisition cost |
| **Payout feels small** | A "Daily" payout is just your own money back | Lead with the habit and lump sum, not growth |
| **Mobile-money charges** | Small amounts get eaten | Prefunded wallet and withdrawal minimum |

---

## 16. Decisions to confirm

1. **Fee:** is 5% the launch fee, and is it flat across packages?
2. **Launch packages:** are 24, 72, and 168 the right three?
3. **Turn position:** strictly by join order, or can members pay or choose for earlier positions later?
4. **Security hold:** the exact hold amount and release rule per turn position
5. **Money holder:** which licensed partner holds funds, or whether each group registers as a chama
6. **Withdrawal minimum and grace period:** KES 50 and 6 hours are placeholders
7. **Renewal:** do groups renew automatically, or do members opt in each cycle?
8. **ID level at sign-up:** phone only at first, or full ID from day one?
