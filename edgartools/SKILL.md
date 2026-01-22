---
name: edgartools
description: Learn the basics of the edgartools library - an SEC EDGAR API wrapper.
---

# Edgartools

Find the latest up to date information by visiting https://edgartools.readthedocs.io/en/latest/.

Edgartools is a python wrapper around the SEC EDGAR API.
It's extremely useful for navigating anything that is publicly accessible through this API.

This includes but is not limited to:
- Explore companies
- Get latest filings of all types
- Manipulate structured xbrl data
- Download entire filings as text or markdown

## Some tips

- You must always set an identity with `edgar.set_identity("First Last first.last@example.com")`.
- This format of `"name email"` is enforced by the SEC.
- There are convenience methods to access a company's latest filings, see `docs/filings.md`
- Do not veer into the deep end of XBRL parsing unless explicitly asked
- Most documents can fit into your context window.
- However, if you must partially read a filing, read the appropriate report.

### Reading reports

```
>>> import edgar
>>> edgar.set_identity("name email@example.com")
>>> company = edgar.Company("WMT")
>>> filing = company.latest(form=["10-K", "10-Q"])
>>> filing.text() # get entire filing as text
>>> filing.markdown() # get entire filing as markdown
>>> filing.reports # get list of specific reports
>>> print(str(filing.reports[37].text())) # get a specific report as text
"""
  Segments and Disaggregated Revenue -
  Revenue from Contract with Customer
  Excluding Assessed Tax Walmart U. S
  (Details) - USD ($)
  $ in Millions
  Segments and Disaggregated Revenue -
  Revenue from Contract with Customer
  Excluding Assessed Tax Walmart U. S
  (Details) - USD ($)
  $ in Millions
  Revenue from External Customer [Line        3 Months Ended                     9 Months Ended
  Items]                                       Oct. 31, 2025    Oct. 31, 2024     Oct. 31, 2025    Oct. 31, 2024
 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  Net sales                                        $ 177,769        $ 168,003         $ 517,500        $ 495,708
  Walmart U. S.
  Revenue from External Customer [Line
  Items]
  Net sales                                          120,678          114,875           353,752          338,892
  Walmart U. S. | eCommerce
  Revenue from External Customer [Line
  Items]
  Net sales                                           24,800           19,500            70,000           56,000
  Grocery | Walmart U. S.
  Revenue from External Customer [Line
  Items]
  Net sales                                           71,713           69,344           210,636          204,455
  General merchandise | Walmart U. S.
  Revenue from External Customer [Line
  Items]
  Net sales                                           27,366           26,621            82,100           81,312
  Health and wellness | Walmart U. S.
  Revenue from External Customer [Line
  Items]
  Net sales                                           18,379           16,360            51,871           45,639
  Other categories | Walmart U. S.
  Revenue from External Customer [Line
  Items]
  Net sales                                          $ 3,220          $ 2,550           $ 9,145          $ 7,486
"""
```
