# ER Diagram — Waste Resource Recycle (WRR)

Drawn from `database/schema.sql` (10 tables, InnoDB, utf8mb4). It replaces the old report images `WRR_ER_Diagram_A4.svg` and `WRR_ER_Diagram_Revised.mmd`, which showed the original columns.

GitHub and VS Code (with a Mermaid extension) draw the diagram below. For the printed report, paste the code block into https://mermaid.live and export it as SVG or PNG.

**Keys:** `PK` primary key · `FK` foreign key · `UK` unique.

```mermaid
erDiagram
    ZONES ||--o{ USERS : "home or operating zone"
    ZONES ||--o{ PICKUP_REQUESTS : "pickup location"
    WASTE_CATEGORIES ||--o{ PICKUP_REQUESTS : "waste type"
    USERS ||--o{ PICKUP_REQUESTS : "submits (user)"
    USERS |o--o{ PICKUP_REQUESTS : "assigned to (collector)"
    PICKUP_REQUESTS ||--o{ REQUEST_STATUS_LOGS : "history"
    USERS ||--o{ REQUEST_STATUS_LOGS : "changed by"
    PICKUP_REQUESTS ||--o| COLLECTION_RECORDS : "weighed as"
    USERS ||--o{ COLLECTION_RECORDS : "weighed by (collector)"
    USERS ||--o{ REDEMPTION_RULES : "set by (admin)"
    REDEMPTION_RULES ||--o{ CASH_REDEMPTIONS : "rate used"
    USERS ||--o{ CASH_REDEMPTIONS : "requests"
    USERS |o--o{ CASH_REDEMPTIONS : "processed by (admin)"
    USERS ||--o{ REWARD_TRANSACTIONS : "owns"
    COLLECTION_RECORDS |o--o{ REWARD_TRANSACTIONS : "EARN / ADJUST"
    CASH_REDEMPTIONS |o--o{ REWARD_TRANSACTIONS : "REDEEM / REFUND"
    USERS ||--o{ NOTIFICATIONS : "receives"
    PICKUP_REQUESTS |o--o{ NOTIFICATIONS : "about"
    CASH_REDEMPTIONS |o--o{ NOTIFICATIONS : "about"

    ZONES {
        int zone_id PK
        varchar name UK "100"
        text description
        boolean is_active
    }
    USERS {
        int user_id PK
        varchar full_name "100"
        varchar email UK "100"
        varchar phone "20"
        varchar password_hash "bcrypt"
        enum role "user, collector, admin"
        varchar address "255"
        int zone_id FK "NULL for admin"
        enum status "active, inactive"
        datetime created_at
    }
    WASTE_CATEGORIES {
        int category_id PK
        varchar name UK "100"
        decimal points_per_kg ">= 0"
        boolean is_other
        boolean is_active
    }
    PICKUP_REQUESTS {
        int request_id PK
        int user_id FK
        int category_id FK
        int zone_id FK
        int collector_id FK "NULL until assigned"
        varchar pickup_address "255"
        varchar contact_phone "20"
        text other_description
        decimal estimated_weight_kg "> 0"
        datetime preferred_at
        enum status "7 states"
        datetime created_at
        datetime updated_at
    }
    REQUEST_STATUS_LOGS {
        int log_id PK
        int request_id FK
        int changed_by_id FK
        varchar old_status
        varchar new_status
        varchar note "reason or correction"
        datetime changed_at
    }
    COLLECTION_RECORDS {
        int record_id PK
        int request_id FK,UK "one per request"
        int collector_id FK
        decimal actual_weight_kg "> 0"
        decimal points_per_kg_applied "rate snapshot"
        datetime collected_at
        datetime completed_at
        text remarks
    }
    REDEMPTION_RULES {
        int rule_id PK
        decimal taka_per_point "> 0"
        decimal min_points ">= 0"
        boolean is_active
        int updated_by FK
        datetime effective_from
        tinyint active_key UK "generated: 1 if active"
    }
    CASH_REDEMPTIONS {
        int redemption_id PK
        int user_id FK
        int rule_id FK
        decimal points_redeemed "> 0"
        decimal cash_amount "fixed at request"
        varchar payout_method "bKash, Nagad, Bank"
        varchar payout_account
        varchar payout_trx_id "set when Paid"
        enum status "Pending, Approved, Rejected, Paid"
        int admin_id FK
        varchar admin_note
        datetime requested_at
        datetime processed_at
    }
    REWARD_TRANSACTIONS {
        int transaction_id PK
        int user_id FK
        enum txn_type "EARN, REDEEM, REFUND, ADJUST"
        int record_id FK
        int redemption_id FK
        decimal points "signed"
        datetime created_at
        int earn_record_id UK "generated: record_id if EARN"
    }
    NOTIFICATIONS {
        int notification_id PK
        int user_id FK
        int request_id FK
        int redemption_id FK
        varchar type "11 types"
        varchar message "255"
        boolean is_read
        datetime created_at
    }
```

## Rules the diagram cannot show

| Rule | How the database enforces it |
|---|---|
| Only one active redemption rule | `active_key` is 1 for the active rule and NULL otherwise; `UNIQUE` allows many NULLs but only one 1 |
| At most one `EARN` per collection record | `earn_record_id` copies `record_id` only for `EARN` rows; `UNIQUE` on it |
| One collection record per request | `collection_records.request_id` is `UNIQUE` |
| Weights and rates are positive | `CHECK (actual_weight_kg > 0)`, `CHECK (estimated_weight_kg > 0)`, `CHECK (points_per_kg >= 0)`, `CHECK (taka_per_point > 0)`, `CHECK (points_redeemed > 0)` |
| Balance never below zero | Not a column: balance = `SUM(reward_transactions.points)`; checked inside the transaction while the user row is locked (`SELECT … FOR UPDATE`) |
| Audit rows are kept | `request_status_logs` → `pickup_requests` is `ON DELETE RESTRICT` |
| Rejecting clears the collector | Done by the service (T5), not by a foreign key; `collector_id` becomes NULL |
