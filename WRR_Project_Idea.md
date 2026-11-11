# Waste Resource Recycle (WRR) — Project Idea

**Course:** Software Engineering Lab (CSE-3112), Faridpur Engineering College
**Project Type:** Web-based Management System
**SDLC Model:** Waterfall
**Architecture:** Three-Tier (Presentation, Application, Data)

---

## 1. Overview

Waste Resource Recycle (WRR) is a web-based platform that connects households (general users) with local waste collectors to make the collection of recyclable waste easier, faster and more organized. Users submit pickup requests for recyclable waste, collectors pick it up and record its actual weight, and users earn reward points that can be redeemed for cash.

The main goal of WRR is to make waste collection **smart, digital and trackable**, while encouraging people to recycle and reducing environmental pollution.

---

## 2. Problem Statement

- Improper waste disposal is a major environmental problem in Bangladesh, and valuable recyclable materials are lost as a result.
- Rapid urban growth and increasing use of packaged products and electronic devices have increased household waste.
- Recyclable waste collection still depends largely on informal scrap collectors, so the process is unorganized and hard to track.
- People have no convenient way to hand over recyclable materials, and little motivation to separate waste properly.

---

## 3. Proposed Solution

WRR provides a digital pickup-request system:

1. A user submits a pickup request with the waste category, pickup location and preferred schedule.
2. The request is assigned to a collector based on zone.
3. The collector accepts or rejects it, collects the waste, and records the actual weight.
4. The system automatically calculates reward points from the collected weight and waste category.
5. The user can track the request, view collection history, and request cash redemption of earned points.

Initially supported waste categories: **Plastic, Paper and E-waste**.

---

## 4. User Roles and Features

### 4.1 General User
- Register and log in
- Submit waste pickup requests
- Select waste category, pickup location and preferred schedule
- Track request status
- View collection history
- Earn reward points based on actual collected weight and waste category
- Request cash redemption of reward points

### 4.2 Waste Collector
- View assigned pickup requests
- Accept or reject requests
- Update collection status
- Record actual collected waste weight
- Manage requests by zone

### 4.3 Administrator
- Manage users and collectors
- Manage pickup requests and collector assignments
- Manage waste categories and reward rules
- Manage zones
- Manage collection records
- Review and process cash redemption requests

---

## 5. Technology Stack

| Layer | Technology |
|---|---|
| Presentation (Frontend) | HTML, CSS, JavaScript |
| Application (Backend) | Node.js, Express.js |
| Data (Database) | MySQL |

---

## 6. Key Challenges

- Database design
- Secure authentication
- Role-based access control (each role can access only its permitted features)
- Collector assignment by zone
- Accurate weight recording
- Correct reward-point calculation and redemption handling

---

## 7. Expected Deliverables

- User, Collector and Admin dashboards
- Secure login with role-based access
- Waste pickup request and tracking system
- Collector assignment and waste-weight recording
- Automatic reward-point calculation
- Collection history and point/redemption management
- Documentation: requirement analysis, ER diagram, database design, UML diagrams, testing documentation, and complete source code

---

## 8. Timeline (7–8 Weeks)

| Week | Activities |
|---|---|
| 1–2 | Requirements, database and system design |
| 3–4 | Frontend, authentication and backend development |
| 5–6 | Dashboards and core feature development |
| 7 | System integration and testing |
| 8 | Documentation and finalization |

---

## 9. Expected Impact

- **Environmental:** Less pollution, and recyclable waste is treated as a resource instead of garbage.
- **Social:** Households get an easy way to recycle, and collectors get organized, zone-based work.
- **Economic:** Users earn rewards convertible to cash, which motivates proper waste separation.

---

## 10. Conclusion

- **Problem:** Careless waste disposal causes pollution and the loss of valuable recyclable materials.
- **Motivation:** Treat waste as a useful resource and encourage people to recycle.
- **Solution:** WRR is a simple web platform that connects households with local waste collectors, helping users recycle easily and earn rewards.
