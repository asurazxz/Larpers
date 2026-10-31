"""Refinery candidate shortlists."""

PROTOTYPE_SHORTLIST = tuple(
    f"KAL_SUP_{n}"
    for n in ("02", "06", "07", "13", "15", "16", "24", "25", "28", "33", "35", "38", "41", "42", "44", "45", "48",
              "49", "51", "54", "59", "64", "70", "71", "77")
) + ("PNK", "PKN", "BPN", "TRK")

SHORTLIST = PROTOTYPE_SHORTLIST
