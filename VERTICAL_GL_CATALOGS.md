# Vertical General Ledger Catalogs
## Geeves.Life — Per-Vertical Chart of Accounts

**Date:** 2026-07-27
**Agent:** COA Agent (Financial Architect)
**Basis:** Manus seed charts + Kimi classification data + owner rules

---

## Overview

Each vertical has its own General Ledger (G.L.) view of the Chart of Accounts.
Accounts are prefixed with the vertical code for easy identification.

| Vertical | Code | Color | Income Focus | Expense Focus |
|----------|------|-------|-------------|---------------|
| Maxfield Bakery | BKY | Orange | Product Sales | Flour, Labor, Packaging |
| Maxfield Market Global | MKT | Green | Product Sales | Inventory, Shipping |
| Blue Lagoon Lodges | BL | Blue | Rental Income | Cleaning, Maintenance |
| Personal | PERS | Purple | — | Groceries, Utilities, Medical |
| Self / Tarik | SELF | Teal | — | Professional Development |
| StartOut | SO | Pink | Sponsorship | Program Costs |
| TJP Global Group | TJPGG | Gold | Consulting | Overhead |
| Good Life | GL | Silver | — | Wellness, Lifestyle |
| B.Lab | BLAB | Coral | — | R&D, Innovation |

---

## 1. Maxfield Bakery (BKY-)

### Income Accounts (money_in)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| BKY-1001 | Sales of Product Income | `Sales of Product Income` (QBO) | Sch C Line 1 |
| BKY-1002 | Catering Income | `Service Income` (QBO) | Sch C Line 1 |
| BKY-1003 | Wholesale Income | `Wholesale Income` (QBO) | Sch C Line 1 |

### Expense Accounts (money_out)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| BKY-2001 | Cost of Goods Sold - Flour | `Cost of Goods Sold` (QBO) | Sch C Line 4 |
| BKY-2002 | Cost of Goods Sold - Sugar | `Cost of Goods Sold` (QBO) | Sch C Line 4 |
| BKY-2003 | Cost of Goods Sold - Packaging | `Cost of Goods Sold` (QBO) | Sch C Line 4 |
| BKY-2004 | Labor - Wages | `Wages` (QBO) | Sch C Line 26 |
| BKY-2005 | Labor - Benefits | `Employee Benefits` (QBO) | Sch C Line 14 |
| BKY-2006 | Rent - Bakery Space | `Rent` (QBO) | Sch C Line 20 |
| BKY-2007 | Utilities - Bakery | `Utilities` (QBO) | Sch C Line 25 |
| BKY-2008 | Equipment - Oven/ Mixer | `Equipment Rental` (QBO) | Sch C Line 20 |
| BKY-2009 | Supplies - Cleaning | `Supplies` (QBO) | Sch C Line 22 |
| BKY-2010 | Marketing - Bakery | `Advertising` (QBO) | Sch C Line 8 |
| BKY-2011 | Insurance - Bakery | `Insurance` (QBO) | Sch C Line 15 |
| BKY-2012 | Licenses & Permits | `Licenses` (QBO) | Sch C Line 23 |

### Financial Accounts
| Code | Name | Type | QBO Mapping |
|------|------|------|-------------|
| BKY-3001 | Bakery Checking | we_own | `Checking` (QBO) |
| BKY-3002 | Bakery Credit Card | we_owe | `Credit Card` (QBO) |

---

## 2. Maxfield Market Global (MKT-)

### Income Accounts (money_in)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| MKT-1001 | Sales of Product Income | `Sales of Product Income` (QBO) | Sch C Line 1 |
| MKT-1002 | Export Income | `Export Sales` (QBO) | Sch C Line 1 |
| MKT-1003 | Commission Income | `Commission Income` (QBO) | Sch C Line 1 |

### Expense Accounts (money_out)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| MKT-2001 | Cost of Goods Sold - Inventory | `Cost of Goods Sold` (QBO) | Sch C Line 4 |
| MKT-2002 | Shipping & Freight | `Shipping` (QBO) | Sch C Line 4 |
| MKT-2003 | Import Duties & Tariffs | `Import Duties` (QBO) | Sch C Line 4 |
| MKT-2004 | Labor - Wages | `Wages` (QBO) | Sch C Line 26 |
| MKT-2005 | Labor - Benefits | `Employee Benefits` (QBO) | Sch C Line 14 |
| MKT-2006 | Warehouse Rent | `Rent` (QBO) | Sch C Line 20 |
| MKT-2007 | Utilities - Warehouse | `Utilities` (QBO) | Sch C Line 25 |
| MKT-2008 | Packaging - Export | `Supplies` (QBO) | Sch C Line 22 |
| MKT-2009 | Marketing - Market | `Advertising` (QBO) | Sch C Line 8 |
| MKT-2010 | Insurance - Market | `Insurance` (QBO) | Sch C Line 15 |
| MKT-2011 | Legal - Export Compliance | `Legal & Professional` (QBO) | Sch C Line 17 |
| MKT-2012 | Platform Fees - Export | `Platform Fees` (QBO) | Sch C Line 10 |
| MKT-2013 | Customs Broker Fees | `Freight & Delivery` (QBO) | Sch C Line 11 |
| MKT-2014 | Product Testing | `Research & Development` (QBO) | Sch C Line 19 |
| MKT-2015 | Travel - Sourcing | `Travel` (QBO) | Sch C Line 24 |

### Financial Accounts
| Code | Name | Type | QBO Mapping |
|------|------|------|-------------|
| MKT-3001 | Market Checking USD | we_own | `Checking` (QBO) |
| MKT-3002 | Market Checking JMD | we_own | `Checking` (QBO) |
| MKT-3003 | Market Credit Line | we_owe | `Credit Card` (QBO) |

---

## 3. Blue Lagoon Lodges (BL-)

### Income Accounts (money_in)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| BL-1001 | Rental Income - Airbnb | `Rental Income` (QBO) | Sch E |
| BL-1002 | Rental Income - VRBO | `Rental Income` (QBO) | Sch E |
| BL-1003 | Rental Income - Booking.com | `Rental Income` (QBO) | Sch E |
| BL-1004 | Rental Income - Direct | `Rental Income` (QBO) | Sch E |
| BL-1005 | Cleaning Fee Income | `Other Income` (QBO) | Sch E |
| BL-1006 | Late Fee Income | `Other Income` (QBO) | Sch E |
| BL-1007 | Damage Deposit Forfeiture | `Other Income` (QBO) | Sch E |

### Expense Accounts (money_out)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| BL-2001 | Cleaning Services | `Cleaning` (QBO) | Sch E |
| BL-2002 | Repairs & Maintenance | `Repairs` (QBO) | Sch E |
| BL-2003 | Utilities - Property | `Utilities` (QBO) | Sch E |
| BL-2004 | Property Insurance | `Insurance` (QBO) | Sch E |
| BL-2005 | Property Taxes | `Taxes` (QBO) | Sch E |
| BL-2006 | Landscaping | `Landscaping` (QBO) | Sch E |
| BL-2007 | Pool Maintenance | `Maintenance` (QBO) | Sch E |
| BL-2008 | Security Systems | `Security` (QBO) | Sch E |
| BL-2009 | Pest Control | `Pest Control` (QBO) | Sch E |
| BL-2010 | Linens & Bedding | `Supplies` (QBO) | Sch E |
| BL-2011 | Guest Amenities | `Guest Supplies` (QBO) | Sch E |
| BL-2012 | Welcome Basket | `Guest Supplies` (QBO) | Sch E |
| BL-2013 | Marketing - Property | `Advertising` (QBO) | Sch E |
| BL-2014 | Photography | `Advertising` (QBO) | Sch E |
| BL-2015 | Platform Fees - Airbnb | `Commission` (QBO) | Sch E |
| BL-2016 | Platform Fees - VRBO | `Commission` (QBO) | Sch E |
| BL-2017 | Platform Fees - Booking.com | `Commission` (QBO) | Sch E |
| BL-2018 | Property Management Fees | `Management Fees` (QBO) | Sch E |
| BL-2019 | Legal - Property | `Legal & Professional` (QBO) | Sch E |
| BL-2020 | Permits & Licenses | `Permits` (QBO) | Sch E |
| BL-2021 | Furniture & Equipment | `Furniture & Fixtures` (QBO) | Sch E |
| BL-2022 | Appliances | `Appliances` (QBO) | Sch E |
| BL-2023 | Painting & Wall Repair | `Repairs` (QBO) | Sch E |
| BL-2024 | Flooring | `Repairs` (QBO) | Sch E |
| BL-2025 | Internet - Property | `Utilities` (QBO) | Sch E |

### Financial Accounts
| Code | Name | Type | QBO Mapping |
|------|------|------|-------------|
| BL-3001 | Property Escrow | we_own | `Savings` (QBO) |
| BL-3002 | Airbnb Savings | we_own | `Savings` (QBO) |
| BL-3003 | Property Mortgage | we_owe | `Mortgage` (QBO) |

---

## 4. Personal (PERS-)

### Expense Accounts (money_out)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| PERS-2001 | Groceries | `Groceries` (QBO) | Personal |
| PERS-2002 | Dining Out | `Meals` (QBO) | Personal |
| PERS-2003 | Utilities - Home | `Utilities` (QBO) | Personal |
| PERS-2004 | Internet - Home | `Internet` (QBO) | Personal |
| PERS-2005 | Phone | `Phone` (QBO) | Personal |
| PERS-2006 | Transportation | `Transportation` (QBO) | Personal |
| PERS-2007 | Fuel | `Fuel` (QBO) | Personal |
| PERS-2008 | Medical & Health | `Medical` (QBO) | Personal |
| PERS-2009 | Education | `Education` (QBO) | Personal |
| PERS-2010 | Clothing | `Clothing` (QBO) | Personal |
| PERS-2011 | Entertainment | `Entertainment` (QBO) | Personal |
| PERS-2012 | Subscriptions - Personal | `Subscriptions` (QBO) | Personal |
| PERS-2013 | Gym & Fitness | `Gym` (QBO) | Personal |
| PERS-2014 | Gifts & Donations | `Gifts` (QBO) | Personal |
| PERS-2015 | Personal Care | `Personal Care` (QBO) | Personal |
| PERS-2016 | Home Improvement | `Home Improvement` (QBO) | Personal |
| PERS-2017 | Bank Fees | `Bank Fees` (QBO) | Personal |
| PERS-2018 | Travel - Personal | `Travel` (QBO) | Personal |
| PERS-2019 | Childcare | `Childcare` (QBO) | Personal |
| PERS-2020 | Pet Expenses | `Pets` (QBO) | Personal |

### Financial Accounts
| Code | Name | Type | QBO Mapping |
|------|------|------|-------------|
| PERS-3001 | Personal Checking | we_own | `Checking` (QBO) |
| PERS-3002 | Personal Savings | we_own | `Savings` (QBO) |
| PERS-3003 | Scotia Visa | we_owe | `Credit Card` (QBO) |
| PERS-3004 | Scotia Mastercard | we_owe | `Credit Card` (QBO) |
| PERS-3005 | Amex | we_owe | `Credit Card` (QBO) |
| PERS-3006 | NCB Visa | we_owe | `Credit Card` (QBO) |
| PERS-3007 | JN Bank | we_own | `Checking` (QBO) |

---

## 5. Self / Tarik (SELF-)

### Expense Accounts (money_out)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| SELF-2001 | Professional Development | `Professional Development` (QBO) | Personal |
| SELF-2002 | Coaching & Mentoring | `Coaching` (QBO) | Personal |
| SELF-2003 | Books & Courses | `Education` (QBO) | Personal |
| SELF-2004 | Conference Fees | `Conferences` (QBO) | Personal |
| SELF-2005 | Networking Events | `Networking` (QBO) | Personal |
| SELF-2006 | Wellness & Mental Health | `Wellness` (QBO) | Personal |
| SELF-2007 | Personal Branding | `Marketing` (QBO) | Personal |
| SELF-2008 | Travel - Business Development | `Travel` (QBO) | Personal |

---

## 6. StartOut (SO-)

### Income Accounts (money_in)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| SO-1001 | Sponsorship Income | `Sponsorship` (QBO) | Sch C Line 1 |
| SO-1002 | Program Fee Income | `Program Fees` (QBO) | Sch C Line 1 |
| SO-1003 | Grant Income | `Grant Income` (QBO) | Sch C Line 1 |

### Expense Accounts (money_out)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| SO-2001 | Program Costs | `Program Expenses` (QBO) | Sch C |
| SO-2002 | Event Costs | `Event Expenses` (QBO) | Sch C |
| SO-2003 | Marketing - StartOut | `Advertising` (QBO) | Sch C |
| SO-2004 | Staff Costs | `Wages` (QBO) | Sch C |
| SO-2005 | Overhead - StartOut | `Office Expenses` (QBO) | Sch C |

---

## 7. TJP Global Group (TJPGG-)

### Income Accounts (money_in)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| TJPGG-1001 | Consulting Income | `Service Income` (QBO) | Sch C Line 1 |
| TJPGG-1002 | Management Fee Income | `Management Fees` (QBO) | Sch C Line 1 |

### Expense Accounts (money_out)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| TJPGG-2001 | Overhead - TJPGG | `Office Expenses` (QBO) | Sch C |
| TJPGG-2002 | Legal - Corporate | `Legal & Professional` (QBO) | Sch C |
| TJPGG-2003 | Accounting - Corporate | `Accounting` (QBO) | Sch C |
| TJPGG-2004 | Insurance - Corporate | `Insurance` (QBO) | Sch C |
| TJPGG-2005 | Intercompany - Due to/from Owner | `Intercompany` (QBO) | Balance Sheet |

---

## 8. Good Life (GL-)

### Expense Accounts (money_out)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| GL-2001 | Wellness Programs | `Wellness` (QBO) | Personal |
| GL-2002 | Lifestyle Experiences | `Entertainment` (QBO) | Personal |
| GL-2003 | Health & Fitness | `Gym` (QBO) | Personal |
| GL-2004 | Personal Development | `Education` (QBO) | Personal |
| GL-2005 | Cultural Activities | `Entertainment` (QBO) | Personal |

---

## 9. B.Lab (BLAB-)

### Expense Accounts (money_out)
| Code | Name | QBO Mapping | Tax Form Line |
|------|------|-------------|---------------|
| BLAB-2001 | R&D - Product | `R&D` (QBO) | Sch C |
| BLAB-2002 | R&D - Process | `R&D` (QBO) | Sch C |
| BLAB-2003 | Innovation Tools | `Software` (QBO) | Sch C |
| BLAB-2004 | Pilot Programs | `Program Expenses` (QBO) | Sch C |
| BLAB-2005 | Experimentation | `R&D` (QBO) | Sch C |

---

## Shared / Inter-Vertical Accounts

These accounts are used across multiple verticals:

| Code | Name | Type | Used By |
|------|------|------|---------|
| SH-1001 | Inter-Account Transfer | (neutral) | All verticals |
| SH-1002 | Owner Contribution | our_stake | All verticals |
| SH-1003 | Owner Draw | our_stake | All verticals |
| SH-1004 | Owner Distribution | our_stake | All verticals |
| SH-1005 | Capital Injection | our_stake | All verticals |
| SH-1006 | Loan Proceeds | we_owe | All verticals |
| SH-1007 | Loan Repayment | we_owe | All verticals |
| SH-1008 | Interest Expense | money_out | All verticals |
| SH-1009 | Depreciation | money_out | Asset verticals |
| SH-1010 | Amortization | money_out | Asset verticals |
