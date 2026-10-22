/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
/*
 * nutrition-db.js -- offline ingredient table for recipe analysis.
 *
 * GENERATED FILE -- do not edit by hand.
 *   cd keto-recipe-analyzer/scripts
 *   python export_db_js.py > ../../foodlog-pwa/nutrition-db.js
 *
 * Source of truth is keto-recipe-analyzer/scripts/nutrition_db.py. Values are
 * grams per 100 g; density is g/ml for volume conversion; units give typical
 * masses for count-style amounts ("1 medium", "1 clove").
 */
(function (root) {
  "use strict";

  var DB = {
    "almond flour": {
      "aliases": [
        "almond meal",
        "ground almonds"
      ],
      "carb": 20.0,
      "density": 0.4,
      "fat": 54.0,
      "fiber": 11.0,
      "protein": 21.0,
      "units": {
        "cup": 96.0
      }
    },
    "almonds": {
      "aliases": [
        "almond"
      ],
      "carb": 22.0,
      "density": 0.5,
      "fat": 50.0,
      "fiber": 12.5,
      "protein": 21.0,
      "units": {
        "cup": 143.0
      }
    },
    "anchovy": {
      "aliases": [
        "anchovies"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 10.0,
      "fiber": 0.0,
      "protein": 29.0,
      "units": {
        "fillet": 4.0
      }
    },
    "apple": {
      "aliases": [],
      "carb": 14.0,
      "density": 0.9,
      "fat": 0.2,
      "fiber": 2.4,
      "protein": 0.3,
      "units": {
        "": 180.0,
        "medium": 180.0
      }
    },
    "artichoke": {
      "aliases": [
        "artichoke hearts",
        "artichokes"
      ],
      "carb": 11.0,
      "density": 0.9,
      "fat": 0.3,
      "fiber": 5.4,
      "protein": 3.3
    },
    "asparagus": {
      "aliases": [],
      "carb": 3.9,
      "density": 0.6,
      "fat": 0.1,
      "fiber": 2.1,
      "protein": 2.2,
      "units": {
        "spear": 16.0
      }
    },
    "avocado": {
      "aliases": [],
      "carb": 8.5,
      "density": 0.95,
      "fat": 15.0,
      "fiber": 6.7,
      "protein": 2.0,
      "units": {
        "": 150.0
      }
    },
    "avocado oil": {
      "aliases": [],
      "carb": 0.0,
      "density": 0.91,
      "fat": 100.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {}
    },
    "bacon": {
      "aliases": [],
      "carb": 1.4,
      "density": 1.0,
      "fat": 42.0,
      "fiber": 0.0,
      "protein": 37.0,
      "units": {
        "rasher": 8.0,
        "slice": 8.0,
        "strip": 8.0
      }
    },
    "baking powder": {
      "aliases": [],
      "carb": 27.7,
      "density": 0.9,
      "fat": 0.0,
      "fiber": 0.2,
      "protein": 0.0
    },
    "baking soda": {
      "aliases": [
        "bicarbonate of soda",
        "sodium bicarbonate"
      ],
      "carb": 0.0,
      "density": 2.2,
      "fat": 0.0,
      "fiber": 0.0,
      "protein": 0.0
    },
    "banana": {
      "aliases": [],
      "carb": 23.0,
      "density": 0.9,
      "fat": 0.3,
      "fiber": 2.6,
      "protein": 1.1,
      "units": {
        "": 118.0,
        "medium": 118.0
      }
    },
    "basil": {
      "aliases": [
        "fresh basil",
        "dried basil"
      ],
      "carb": 2.6,
      "density": 0.2,
      "fat": 0.6,
      "fiber": 1.6,
      "protein": 3.2
    },
    "bay leaf": {
      "aliases": [
        "bay leaves"
      ],
      "carb": 75.0,
      "density": 0.2,
      "fat": 8.4,
      "fiber": 26.3,
      "protein": 7.6,
      "units": {
        "": 0.2
      }
    },
    "beer": {
      "aliases": [
        "stout",
        "porter",
        "guinness",
        "ale",
        "lager"
      ],
      "carb": 3.6,
      "density": 1.0,
      "fat": 0.0,
      "fiber": 0.0,
      "protein": 0.5
    },
    "beet": {
      "aliases": [
        "beetroot",
        "beets"
      ],
      "carb": 10.0,
      "density": 0.9,
      "fat": 0.2,
      "fiber": 2.8,
      "protein": 1.6,
      "units": {
        "": 80.0
      }
    },
    "bell pepper": {
      "aliases": [
        "pepper red",
        "red pepper",
        "capsicum"
      ],
      "carb": 6.0,
      "density": 0.9,
      "fat": 0.3,
      "fiber": 2.1,
      "protein": 1.0,
      "units": {
        "": 120.0
      }
    },
    "black beans": {
      "aliases": [
        "black bean"
      ],
      "carb": 24.0,
      "density": 0.7,
      "fat": 0.5,
      "fiber": 8.7,
      "protein": 8.9,
      "units": {
        "cup": 172.0
      }
    },
    "blueberry": {
      "aliases": [
        "blueberries",
        "berries",
        "raspberries"
      ],
      "carb": 14.0,
      "density": 0.7,
      "fat": 0.3,
      "fiber": 2.4,
      "protein": 0.7,
      "units": {
        "cup": 148.0
      }
    },
    "bread": {
      "aliases": [
        "white bread",
        "toast",
        "loaf"
      ],
      "carb": 49.0,
      "density": 0.3,
      "fat": 3.2,
      "fiber": 2.7,
      "protein": 9.0,
      "units": {
        "slice": 28.0
      }
    },
    "breadcrumbs": {
      "aliases": [
        "bread crumbs",
        "panko",
        "breadcrumb"
      ],
      "carb": 72.0,
      "density": 0.45,
      "fat": 5.3,
      "fiber": 4.5,
      "protein": 13.0,
      "units": {
        "cup": 108.0
      }
    },
    "brisket": {
      "aliases": [
        "beef brisket"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 17.0,
      "fiber": 0.0,
      "protein": 19.0,
      "units": {}
    },
    "broccoli": {
      "aliases": [],
      "carb": 7.0,
      "density": 0.6,
      "fat": 0.4,
      "fiber": 2.6,
      "protein": 2.8,
      "units": {
        "cup": 90.0
      }
    },
    "brown sugar": {
      "aliases": [],
      "carb": 98.0,
      "density": 0.9,
      "fat": 0.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {
        "cup": 220.0
      }
    },
    "butter": {
      "aliases": [],
      "carb": 0.1,
      "density": 0.96,
      "fat": 81.0,
      "fiber": 0.0,
      "protein": 0.9,
      "units": {
        "stick": 113.0
      }
    },
    "buttermilk": {
      "aliases": [],
      "carb": 4.8,
      "density": 1.03,
      "fat": 0.9,
      "fiber": 0.0,
      "protein": 3.3
    },
    "cabbage": {
      "aliases": [],
      "carb": 5.8,
      "density": 0.6,
      "fat": 0.1,
      "fiber": 2.5,
      "protein": 1.3,
      "units": {}
    },
    "capers": {
      "aliases": [
        "caper"
      ],
      "carb": 4.9,
      "density": 0.9,
      "fat": 0.9,
      "fiber": 3.2,
      "protein": 2.4
    },
    "carrot": {
      "aliases": [
        "carrots"
      ],
      "carb": 9.6,
      "density": 0.9,
      "fat": 0.2,
      "fiber": 2.8,
      "protein": 0.9,
      "units": {
        "": 60.0,
        "medium": 60.0
      }
    },
    "cauliflower": {
      "aliases": [
        "cauliflower rice"
      ],
      "carb": 5.0,
      "density": 0.6,
      "fat": 0.3,
      "fiber": 2.0,
      "protein": 1.9,
      "units": {
        "cup": 107.0,
        "head": 600.0
      }
    },
    "celery": {
      "aliases": [],
      "carb": 3.0,
      "density": 0.6,
      "fat": 0.2,
      "fiber": 1.6,
      "protein": 0.7,
      "units": {
        "stalk": 40.0
      }
    },
    "cheese cheddar": {
      "aliases": [
        "cheddar",
        "cheese",
        "parmesan"
      ],
      "carb": 3.4,
      "density": 1.0,
      "fat": 33.0,
      "fiber": 0.0,
      "protein": 25.0,
      "units": {
        "slice": 22.0
      }
    },
    "chia seeds": {
      "aliases": [
        "chia"
      ],
      "carb": 42.0,
      "density": 0.6,
      "fat": 31.0,
      "fiber": 34.0,
      "protein": 17.0,
      "units": {}
    },
    "chicken breast": {
      "aliases": [
        "chicken"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 3.6,
      "fiber": 0.0,
      "protein": 31.0,
      "units": {
        "breast": 170.0
      }
    },
    "chicken thigh": {
      "aliases": [
        "chicken thighs",
        "boneless skinless chicken thigh",
        "chicken leg"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 11.0,
      "fiber": 0.0,
      "protein": 19.0,
      "units": {
        "thigh": 110.0
      }
    },
    "chicken wing": {
      "aliases": [
        "chicken wings",
        "wings"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 16.0,
      "fiber": 0.0,
      "protein": 18.0,
      "units": {
        "wing": 45.0
      }
    },
    "chickpeas": {
      "aliases": [
        "garbanzo",
        "garbanzo beans"
      ],
      "carb": 27.0,
      "density": 0.7,
      "fat": 2.6,
      "fiber": 7.6,
      "protein": 8.9,
      "units": {
        "cup": 164.0
      }
    },
    "chuck roast": {
      "aliases": [
        "beef chuck",
        "pot roast",
        "stew beef",
        "stewing beef",
        "beef stew meat",
        "braising steak"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 16.0,
      "fiber": 0.0,
      "protein": 19.0,
      "units": {}
    },
    "cilantro": {
      "aliases": [
        "coriander leaf"
      ],
      "carb": 3.7,
      "density": 0.2,
      "fat": 0.5,
      "fiber": 2.8,
      "protein": 2.1,
      "units": {
        "bunch": 45.0
      }
    },
    "cinnamon": {
      "aliases": [
        "ground cinnamon"
      ],
      "carb": 80.6,
      "density": 0.5,
      "fat": 1.2,
      "fiber": 53.1,
      "protein": 4.0
    },
    "cocoa powder": {
      "aliases": [
        "cacao",
        "unsweetened cocoa"
      ],
      "carb": 58.0,
      "density": 0.5,
      "fat": 14.0,
      "fiber": 33.0,
      "protein": 20.0,
      "units": {}
    },
    "coconut": {
      "aliases": [
        "shredded coconut",
        "desiccated coconut"
      ],
      "carb": 15.0,
      "density": 0.4,
      "fat": 33.0,
      "fiber": 9.0,
      "protein": 3.3,
      "units": {
        "cup": 80.0
      }
    },
    "coconut flour": {
      "aliases": [],
      "carb": 60.0,
      "density": 0.45,
      "fat": 13.0,
      "fiber": 39.0,
      "protein": 18.0,
      "units": {
        "cup": 112.0
      }
    },
    "coconut milk": {
      "aliases": [],
      "carb": 3.3,
      "density": 1.0,
      "fat": 24.0,
      "fiber": 0.0,
      "protein": 2.3,
      "units": {
        "cup": 240.0
      }
    },
    "coconut oil": {
      "aliases": [],
      "carb": 0.0,
      "density": 0.92,
      "fat": 100.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {}
    },
    "corn": {
      "aliases": [
        "sweetcorn"
      ],
      "carb": 19.0,
      "density": 0.7,
      "fat": 1.4,
      "fiber": 2.7,
      "protein": 3.3,
      "units": {
        "cup": 154.0,
        "ear": 100.0
      }
    },
    "cornstarch": {
      "aliases": [
        "corn flour",
        "cornflour"
      ],
      "carb": 91.0,
      "density": 0.5,
      "fat": 0.1,
      "fiber": 0.9,
      "protein": 0.3,
      "units": {}
    },
    "cottage cheese": {
      "aliases": [],
      "carb": 3.4,
      "density": 1.0,
      "fat": 4.3,
      "fiber": 0.0,
      "protein": 11.0,
      "units": {
        "cup": 210.0
      }
    },
    "cream cheese": {
      "aliases": [],
      "carb": 4.1,
      "density": 1.0,
      "fat": 34.0,
      "fiber": 0.0,
      "protein": 6.2,
      "units": {}
    },
    "cucumber": {
      "aliases": [],
      "carb": 3.6,
      "density": 0.95,
      "fat": 0.1,
      "fiber": 0.5,
      "protein": 0.7,
      "units": {
        "": 300.0
      }
    },
    "dark chocolate": {
      "aliases": [
        "chocolate"
      ],
      "carb": 46.0,
      "density": 1.0,
      "fat": 43.0,
      "fiber": 11.0,
      "protein": 8.0,
      "units": {}
    },
    "dill": {
      "aliases": [
        "fresh dill"
      ],
      "carb": 7.0,
      "density": 0.2,
      "fat": 1.1,
      "fiber": 2.1,
      "protein": 3.5,
      "units": {
        "bunch": 30.0,
        "sprig": 1.0
      }
    },
    "egg": {
      "aliases": [
        "eggs",
        "whole egg"
      ],
      "carb": 1.1,
      "density": 1.03,
      "fat": 9.5,
      "fiber": 0.0,
      "protein": 12.6,
      "units": {
        "": 50.0,
        "large": 50.0,
        "medium": 44.0,
        "small": 38.0
      }
    },
    "erythritol": {
      "aliases": [
        "monk fruit",
        "allulose",
        "stevia",
        "keto sweetener"
      ],
      "carb": 0.0,
      "density": 0.7,
      "fat": 0.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {}
    },
    "feta": {
      "aliases": [],
      "carb": 4.1,
      "density": 1.0,
      "fat": 21.0,
      "fiber": 0.0,
      "protein": 14.0,
      "units": {}
    },
    "filet mignon": {
      "aliases": [
        "tenderloin",
        "beef tenderloin",
        "filet"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 9.0,
      "fiber": 0.0,
      "protein": 22.0,
      "units": {
        "steak": 227.0
      }
    },
    "flank steak": {
      "aliases": [
        "skirt steak",
        "flap steak",
        "flat iron steak"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 7.0,
      "fiber": 0.0,
      "protein": 22.0,
      "units": {
        "steak": 227.0
      }
    },
    "flax seeds": {
      "aliases": [
        "flaxseed",
        "flax",
        "linseed"
      ],
      "carb": 29.0,
      "density": 0.6,
      "fat": 42.0,
      "fiber": 27.0,
      "protein": 18.0,
      "units": {}
    },
    "flour": {
      "aliases": [
        "all purpose flour",
        "plain flour",
        "wheat flour"
      ],
      "carb": 76.0,
      "density": 0.53,
      "fat": 1.0,
      "fiber": 2.7,
      "protein": 10.0,
      "units": {
        "cup": 125.0
      }
    },
    "garlic": {
      "aliases": [
        "garlic clove",
        "cloves garlic"
      ],
      "carb": 33.0,
      "density": 0.9,
      "fat": 0.5,
      "fiber": 2.1,
      "protein": 6.4,
      "units": {
        "clove": 3.0,
        "cloves": 3.0
      }
    },
    "ghee": {
      "aliases": [
        "clarified butter"
      ],
      "carb": 0.0,
      "density": 0.91,
      "fat": 99.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {}
    },
    "ginger": {
      "aliases": [
        "fresh ginger",
        "ground ginger",
        "grated ginger",
        "minced ginger"
      ],
      "carb": 17.8,
      "density": 0.9,
      "fat": 0.8,
      "fiber": 2.0,
      "protein": 1.8
    },
    "greek yogurt full fat": {
      "aliases": [
        "greek yogurt",
        "full fat yogurt"
      ],
      "carb": 3.6,
      "density": 1.03,
      "fat": 5.0,
      "fiber": 0.0,
      "protein": 9.0,
      "units": {
        "cup": 245.0
      }
    },
    "green beans": {
      "aliases": [
        "green bean",
        "string beans"
      ],
      "carb": 7.0,
      "density": 0.6,
      "fat": 0.2,
      "fiber": 2.7,
      "protein": 1.8,
      "units": {
        "cup": 100.0
      }
    },
    "ground beef": {
      "aliases": [
        "beef",
        "hamburger",
        "minced beef",
        "ground chuck"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 20.0,
      "fiber": 0.0,
      "protein": 26.0,
      "units": {}
    },
    "ground beef lean": {
      "aliases": [
        "lean ground beef",
        "93/7 ground beef",
        "extra lean ground beef"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 7.0,
      "fiber": 0.0,
      "protein": 21.0,
      "units": {}
    },
    "ground turkey": {
      "aliases": [
        "turkey"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 8.0,
      "fiber": 0.0,
      "protein": 27.0,
      "units": {}
    },
    "ham": {
      "aliases": [],
      "carb": 1.5,
      "density": 1.0,
      "fat": 5.5,
      "fiber": 0.0,
      "protein": 21.0,
      "units": {
        "slice": 28.0
      }
    },
    "heavy cream": {
      "aliases": [
        "double cream",
        "whipping cream"
      ],
      "carb": 2.8,
      "density": 1.0,
      "fat": 37.0,
      "fiber": 0.0,
      "protein": 2.1,
      "units": {
        "cup": 238.0
      }
    },
    "honey": {
      "aliases": [],
      "carb": 82.0,
      "density": 1.4,
      "fat": 0.0,
      "fiber": 0.2,
      "protein": 0.3,
      "units": {}
    },
    "instant coffee": {
      "aliases": [
        "freeze-dried coffee",
        "freeze dried coffee",
        "coffee granules",
        "espresso powder",
        "coffee powder"
      ],
      "carb": 41.1,
      "density": 0.135,
      "fat": 0.5,
      "fiber": 0.0,
      "protein": 12.2,
      "units": {
        "": 2.0
      }
    },
    "kale": {
      "aliases": [],
      "carb": 8.8,
      "density": 0.4,
      "fat": 0.9,
      "fiber": 3.6,
      "protein": 4.3,
      "units": {
        "cup": 67.0
      }
    },
    "ketchup": {
      "aliases": [],
      "carb": 26.0,
      "density": 1.1,
      "fat": 0.1,
      "fiber": 0.3,
      "protein": 1.3,
      "units": {}
    },
    "lamb chop": {
      "aliases": [
        "lamb",
        "lamb loin chop",
        "rack of lamb",
        "leg of lamb",
        "ground lamb"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 17.0,
      "fiber": 0.0,
      "protein": 20.0,
      "units": {
        "chop": 100.0
      }
    },
    "lard": {
      "aliases": [
        "tallow"
      ],
      "carb": 0.0,
      "density": 0.92,
      "fat": 100.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {}
    },
    "lemon juice": {
      "aliases": [],
      "carb": 6.9,
      "density": 1.03,
      "fat": 0.2,
      "fiber": 0.3,
      "protein": 0.4,
      "units": {
        "lemon": 45.0
      }
    },
    "lemon zest": {
      "aliases": [
        "zest",
        "lemon peel"
      ],
      "carb": 16.0,
      "density": 0.3,
      "fat": 0.3,
      "fiber": 10.6,
      "protein": 1.5,
      "units": {
        "": 6.0,
        "lemon": 6.0
      }
    },
    "lentils": {
      "aliases": [
        "lentil"
      ],
      "carb": 20.0,
      "density": 0.7,
      "fat": 0.4,
      "fiber": 7.9,
      "protein": 9.0,
      "units": {
        "cup": 198.0
      }
    },
    "lettuce": {
      "aliases": [
        "romaine",
        "iceberg"
      ],
      "carb": 2.9,
      "density": 0.3,
      "fat": 0.1,
      "fiber": 1.3,
      "protein": 0.9,
      "units": {}
    },
    "lime juice": {
      "aliases": [
        "lime"
      ],
      "carb": 8.4,
      "density": 1.03,
      "fat": 0.1,
      "fiber": 0.4,
      "protein": 0.4,
      "units": {
        "lime": 30.0
      }
    },
    "maple syrup": {
      "aliases": [],
      "carb": 67.0,
      "density": 1.32,
      "fat": 0.1,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {}
    },
    "mayonnaise": {
      "aliases": [
        "mayo"
      ],
      "carb": 1.0,
      "density": 0.91,
      "fat": 75.0,
      "fiber": 0.0,
      "protein": 1.0,
      "units": {}
    },
    "milk": {
      "aliases": [
        "whole milk"
      ],
      "carb": 4.8,
      "density": 1.03,
      "fat": 3.6,
      "fiber": 0.0,
      "protein": 3.4,
      "units": {
        "cup": 244.0
      }
    },
    "mirin": {
      "aliases": [],
      "carb": 43.0,
      "density": 1.1,
      "fat": 0.0,
      "fiber": 0.0,
      "protein": 0.2
    },
    "molasses": {
      "aliases": [],
      "carb": 74.7,
      "density": 1.4,
      "fat": 0.1,
      "fiber": 0.0,
      "protein": 0.0
    },
    "mozzarella": {
      "aliases": [],
      "carb": 2.2,
      "density": 1.0,
      "fat": 22.0,
      "fiber": 0.0,
      "protein": 22.0,
      "units": {}
    },
    "mushroom": {
      "aliases": [
        "mushrooms"
      ],
      "carb": 3.3,
      "density": 0.5,
      "fat": 0.3,
      "fiber": 1.0,
      "protein": 3.1,
      "units": {
        "": 18.0
      }
    },
    "mustard": {
      "aliases": [
        "dijon mustard",
        "yellow mustard"
      ],
      "carb": 5.8,
      "density": 1.0,
      "fat": 4.0,
      "fiber": 4.0,
      "protein": 8.0,
      "units": {}
    },
    "nori": {
      "aliases": [
        "seaweed",
        "nori sheet"
      ],
      "carb": 5.1,
      "density": 0.2,
      "fat": 0.3,
      "fiber": 0.3,
      "protein": 5.8,
      "units": {
        "": 2.6,
        "sheet": 2.6
      }
    },
    "nutmeg": {
      "aliases": [
        "ground nutmeg"
      ],
      "carb": 49.3,
      "density": 0.5,
      "fat": 36.3,
      "fiber": 20.8,
      "protein": 5.8
    },
    "oats": {
      "aliases": [
        "oatmeal",
        "rolled oats"
      ],
      "carb": 66.0,
      "density": 0.4,
      "fat": 6.9,
      "fiber": 11.0,
      "protein": 17.0,
      "units": {
        "cup": 81.0
      }
    },
    "olive oil": {
      "aliases": [
        "extra virgin olive oil",
        "evoo",
        "oil"
      ],
      "carb": 0.0,
      "density": 0.91,
      "fat": 100.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {}
    },
    "onion": {
      "aliases": [
        "onions",
        "yellow onion",
        "white onion"
      ],
      "carb": 9.3,
      "density": 0.9,
      "fat": 0.1,
      "fiber": 1.7,
      "protein": 1.1,
      "units": {
        "": 110.0,
        "large": 150.0,
        "medium": 110.0,
        "small": 70.0
      }
    },
    "oregano": {
      "aliases": [
        "dried oregano"
      ],
      "carb": 68.9,
      "density": 0.3,
      "fat": 4.3,
      "fiber": 42.5,
      "protein": 9.0
    },
    "paprika": {
      "aliases": [],
      "carb": 54.0,
      "density": 0.46,
      "fat": 13.0,
      "fiber": 35.0,
      "protein": 14.0,
      "units": {
        "pinch": 0.3
      }
    },
    "parsley": {
      "aliases": [
        "fresh parsley",
        "flat leaf parsley"
      ],
      "carb": 6.3,
      "density": 0.2,
      "fat": 0.8,
      "fiber": 3.3,
      "protein": 3.0,
      "units": {
        "bunch": 60.0,
        "sprig": 1.0
      }
    },
    "pasta": {
      "aliases": [
        "spaghetti",
        "macaroni",
        "noodles",
        "penne"
      ],
      "carb": 25.0,
      "density": 0.6,
      "fat": 1.1,
      "fiber": 1.8,
      "protein": 5.8,
      "units": {
        "cup": 140.0
      }
    },
    "peanut butter": {
      "aliases": [],
      "carb": 20.0,
      "density": 1.0,
      "fat": 50.0,
      "fiber": 6.0,
      "protein": 25.0,
      "units": {
        "cup": 258.0
      }
    },
    "peanuts": {
      "aliases": [
        "peanut",
        "chopped peanuts"
      ],
      "carb": 16.1,
      "density": 0.6,
      "fat": 49.2,
      "fiber": 8.5,
      "protein": 25.8
    },
    "peas": {
      "aliases": [
        "green peas"
      ],
      "carb": 14.0,
      "density": 0.7,
      "fat": 0.4,
      "fiber": 5.1,
      "protein": 5.4,
      "units": {
        "cup": 145.0
      }
    },
    "pepper": {
      "aliases": [
        "black pepper",
        "ground pepper"
      ],
      "carb": 64.0,
      "density": 0.5,
      "fat": 3.3,
      "fiber": 25.0,
      "protein": 10.0,
      "units": {
        "pinch": 0.3
      }
    },
    "pork": {
      "aliases": [
        "ground pork",
        "pork loin"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 21.0,
      "fiber": 0.0,
      "protein": 27.0,
      "units": {}
    },
    "pork chop": {
      "aliases": [
        "bone-in pork chop",
        "boneless pork chop",
        "pork loin chop"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 9.0,
      "fiber": 0.0,
      "protein": 23.0,
      "units": {
        "chop": 170.0
      }
    },
    "pork rinds": {
      "aliases": [
        "pork rind",
        "crushed pork rinds",
        "chicharron"
      ],
      "carb": 0.0,
      "density": 0.3,
      "fat": 35.0,
      "fiber": 0.0,
      "protein": 61.0,
      "units": {
        "cup": 30.0
      }
    },
    "pork shoulder": {
      "aliases": [
        "pork butt",
        "boston butt",
        "picnic shoulder",
        "pulled pork"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 15.0,
      "fiber": 0.0,
      "protein": 18.0,
      "units": {}
    },
    "pork tenderloin": {
      "aliases": [],
      "carb": 0.0,
      "density": 1.0,
      "fat": 3.5,
      "fiber": 0.0,
      "protein": 21.0,
      "units": {}
    },
    "potato": {
      "aliases": [
        "potatoes"
      ],
      "carb": 17.0,
      "density": 0.9,
      "fat": 0.1,
      "fiber": 2.2,
      "protein": 2.0,
      "units": {
        "": 170.0,
        "medium": 170.0
      }
    },
    "pumpkin": {
      "aliases": [
        "pumpkin puree",
        "canned pumpkin"
      ],
      "carb": 7.0,
      "density": 1.0,
      "fat": 0.1,
      "fiber": 0.5,
      "protein": 1.0
    },
    "quinoa": {
      "aliases": [],
      "carb": 21.0,
      "density": 0.7,
      "fat": 1.9,
      "fiber": 2.8,
      "protein": 4.4,
      "units": {
        "cup": 185.0
      }
    },
    "radish": {
      "aliases": [
        "radishes"
      ],
      "carb": 3.4,
      "density": 0.9,
      "fat": 0.1,
      "fiber": 1.6,
      "protein": 0.7,
      "units": {
        "": 4.5
      }
    },
    "raisins": {
      "aliases": [
        "raisin",
        "sultanas"
      ],
      "carb": 79.2,
      "density": 0.8,
      "fat": 0.5,
      "fiber": 3.7,
      "protein": 3.1
    },
    "ribeye": {
      "aliases": [
        "rib eye",
        "ribeye steak",
        "rib eye steak",
        "ribeye roast",
        "prime rib"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 18.0,
      "fiber": 0.0,
      "protein": 20.0,
      "units": {
        "steak": 340.0
      }
    },
    "rice": {
      "aliases": [
        "white rice",
        "cooked rice"
      ],
      "carb": 28.0,
      "density": 0.8,
      "fat": 0.3,
      "fiber": 0.4,
      "protein": 2.7,
      "units": {
        "cup": 158.0
      }
    },
    "salmon": {
      "aliases": [
        "salmon fillet"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 13.0,
      "fiber": 0.0,
      "protein": 20.0,
      "units": {
        "fillet": 170.0
      }
    },
    "salt": {
      "aliases": [
        "sea salt",
        "kosher salt"
      ],
      "carb": 0.0,
      "density": 1.2,
      "fat": 0.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {
        "pinch": 0.36
      }
    },
    "sardines canned": {
      "aliases": [
        "sardine",
        "sardines",
        "canned sardines",
        "tinned sardines"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 11.5,
      "fiber": 0.0,
      "protein": 24.6,
      "units": {
        "can": 227.0
      }
    },
    "sausage": {
      "aliases": [],
      "carb": 1.4,
      "density": 1.0,
      "fat": 27.0,
      "fiber": 0.0,
      "protein": 15.0,
      "units": {
        "link": 40.0
      }
    },
    "scallion": {
      "aliases": [
        "green onion",
        "green onions",
        "spring onion",
        "chives"
      ],
      "carb": 7.3,
      "density": 0.5,
      "fat": 0.2,
      "fiber": 2.6,
      "protein": 1.8,
      "units": {
        "": 15.0,
        "stalk": 15.0
      }
    },
    "sesame oil": {
      "aliases": [],
      "carb": 0.0,
      "density": 0.92,
      "fat": 100.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {}
    },
    "sesame seeds": {
      "aliases": [
        "sesame"
      ],
      "carb": 23.0,
      "density": 0.6,
      "fat": 50.0,
      "fiber": 12.0,
      "protein": 18.0,
      "units": {}
    },
    "short ribs": {
      "aliases": [
        "short rib",
        "beef short ribs"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 25.0,
      "fiber": 0.0,
      "protein": 17.0,
      "units": {}
    },
    "shortening": {
      "aliases": [
        "vegetable shortening",
        "crisco"
      ],
      "carb": 0.0,
      "density": 0.9,
      "fat": 100.0,
      "fiber": 0.0,
      "protein": 0.0
    },
    "shrimp": {
      "aliases": [
        "prawns",
        "prawn",
        "shrimps"
      ],
      "carb": 0.2,
      "density": 1.0,
      "fat": 1.7,
      "fiber": 0.0,
      "protein": 24.0,
      "units": {}
    },
    "sirloin steak": {
      "aliases": [
        "sirloin",
        "top sirloin",
        "sirloin tip"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 8.0,
      "fiber": 0.0,
      "protein": 22.0,
      "units": {
        "steak": 227.0
      }
    },
    "sour cream": {
      "aliases": [],
      "carb": 4.6,
      "density": 1.0,
      "fat": 20.0,
      "fiber": 0.0,
      "protein": 2.4,
      "units": {
        "cup": 230.0
      }
    },
    "soy sauce": {
      "aliases": [
        "tamari"
      ],
      "carb": 4.9,
      "density": 1.1,
      "fat": 0.1,
      "fiber": 0.8,
      "protein": 8.0,
      "units": {}
    },
    "spinach": {
      "aliases": [],
      "carb": 3.6,
      "density": 0.3,
      "fat": 0.4,
      "fiber": 2.2,
      "protein": 2.9,
      "units": {
        "cup": 30.0
      }
    },
    "strawberry": {
      "aliases": [
        "strawberries"
      ],
      "carb": 7.7,
      "density": 0.6,
      "fat": 0.3,
      "fiber": 2.0,
      "protein": 0.7,
      "units": {
        "cup": 144.0
      }
    },
    "strip steak": {
      "aliases": [
        "new york strip",
        "ny strip",
        "strip loin",
        "porterhouse",
        "t-bone",
        "t bone"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 11.0,
      "fiber": 0.0,
      "protein": 22.0,
      "units": {
        "steak": 283.0
      }
    },
    "sugar": {
      "aliases": [
        "white sugar",
        "granulated sugar"
      ],
      "carb": 100.0,
      "density": 0.85,
      "fat": 0.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {
        "cup": 200.0
      }
    },
    "sweet potato": {
      "aliases": [
        "yam"
      ],
      "carb": 20.0,
      "density": 0.9,
      "fat": 0.1,
      "fiber": 3.0,
      "protein": 1.6,
      "units": {
        "": 130.0,
        "medium": 130.0
      }
    },
    "toffee candy bar": {
      "aliases": [
        "heath bar",
        "heath bars",
        "toffee bar",
        "toffee bars",
        "toffee",
        "skor bar",
        "english toffee"
      ],
      "carb": 61.5,
      "density": 1.0,
      "fat": 33.3,
      "fiber": 0.8,
      "protein": 2.6,
      "units": {
        "": 39.0,
        "bar": 39.0
      }
    },
    "tofu": {
      "aliases": [],
      "carb": 1.9,
      "density": 1.05,
      "fat": 4.8,
      "fiber": 0.3,
      "protein": 8.0,
      "units": {}
    },
    "tomato": {
      "aliases": [
        "tomatoes"
      ],
      "carb": 3.9,
      "density": 0.95,
      "fat": 0.2,
      "fiber": 1.2,
      "protein": 0.9,
      "units": {
        "": 120.0,
        "medium": 120.0
      }
    },
    "tomato paste": {
      "aliases": [],
      "carb": 19.0,
      "density": 1.1,
      "fat": 0.5,
      "fiber": 4.1,
      "protein": 4.3,
      "units": {}
    },
    "tomato sauce": {
      "aliases": [
        "passata",
        "marinara"
      ],
      "carb": 7.0,
      "density": 1.0,
      "fat": 0.5,
      "fiber": 1.5,
      "protein": 1.3,
      "units": {
        "cup": 245.0
      }
    },
    "tortilla": {
      "aliases": [
        "flour tortilla",
        "corn tortilla",
        "wrap"
      ],
      "carb": 46.0,
      "density": 0.4,
      "fat": 7.0,
      "fiber": 3.0,
      "protein": 8.0,
      "units": {
        "": 30.0
      }
    },
    "tuna canned": {
      "aliases": [
        "tuna",
        "canned tuna"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 8.0,
      "fiber": 0.0,
      "protein": 25.5,
      "units": {
        "can": 142.0
      }
    },
    "vanilla extract": {
      "aliases": [
        "vanilla",
        "pure vanilla extract"
      ],
      "carb": 12.7,
      "density": 0.88,
      "fat": 0.1,
      "fiber": 0.0,
      "protein": 0.1,
      "units": {
        "": 4.2
      }
    },
    "vegetable oil": {
      "aliases": [
        "canola oil",
        "sunflower oil",
        "cooking oil"
      ],
      "carb": 0.0,
      "density": 0.92,
      "fat": 100.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {}
    },
    "vinegar": {
      "aliases": [
        "white vinegar",
        "apple cider vinegar",
        "balsamic"
      ],
      "carb": 0.9,
      "density": 1.0,
      "fat": 0.0,
      "fiber": 0.0,
      "protein": 0.0,
      "units": {}
    },
    "walnuts": {
      "aliases": [
        "walnut"
      ],
      "carb": 14.0,
      "density": 0.5,
      "fat": 65.0,
      "fiber": 6.7,
      "protein": 15.0,
      "units": {
        "cup": 117.0
      }
    },
    "water": {
      "aliases": [
        "ice water",
        "warm water",
        "cold water",
        "boiling water",
        "hot water"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 0.0,
      "fiber": 0.0,
      "protein": 0.0
    },
    "white fish": {
      "aliases": [
        "cod",
        "haddock",
        "tilapia",
        "pollock",
        "fish"
      ],
      "carb": 0.0,
      "density": 1.0,
      "fat": 2.0,
      "fiber": 0.0,
      "protein": 18.0,
      "units": {
        "fillet": 140.0
      }
    },
    "yeast": {
      "aliases": [
        "active dry yeast",
        "instant yeast",
        "rapid-rise yeast",
        "dry yeast"
      ],
      "carb": 41.2,
      "density": 0.8,
      "fat": 7.6,
      "fiber": 26.9,
      "protein": 40.4,
      "units": {
        "": 7.0,
        "package": 7.0
      }
    },
    "yogurt": {
      "aliases": [
        "plain yogurt",
        "yoghurt",
        "natural yogurt"
      ],
      "carb": 4.7,
      "density": 1.03,
      "fat": 3.3,
      "fiber": 0.0,
      "protein": 5.7,
      "units": {
        "cup": 245.0
      }
    },
    "zucchini": {
      "aliases": [
        "courgette"
      ],
      "carb": 3.1,
      "density": 0.9,
      "fat": 0.3,
      "fiber": 1.0,
      "protein": 1.2,
      "units": {
        "": 200.0,
        "medium": 200.0
      }
    }
  };

  var SWAPS = {
    "apple": "Swap for a small amount of berries (strawberries / raspberries).",
    "banana": "Use a little mashed berries or avocado for creaminess instead.",
    "beet": "Use sparingly; roasted radishes give a similar look with far fewer carbs.",
    "black beans": "Beans are high-carb for keto - use black soybeans or cut the portion sharply.",
    "bread": "Use low-carb / almond-flour bread, or lettuce wraps in place of the slice.",
    "breadcrumbs": "Replace with almond flour or crushed pork rinds (near-zero carb binders). Grated parmesan also works to bind cakes.",
    "brown sugar": "Replace with a brown-sugar-style erythritol blend (zero net carbs).",
    "carrot": "Use sparingly or swap for diced celery / bell pepper to cut carbs.",
    "carrots": "Use sparingly or swap for diced celery / bell pepper to cut carbs.",
    "chickpeas": "Swap for roasted cauliflower; for hummus, use a cauliflower or zucchini base.",
    "corn": "Omit, or swap for cauliflower or diced bell pepper for color and crunch.",
    "cornstarch": "Thicken with xanthan gum or glucomannan - a pinch replaces a spoonful.",
    "dark chocolate": "Use 90%+ dark or sugar-free chocolate to cut the carbs.",
    "flour": "Replace with almond flour or coconut flour (use ~1/4 the amount for coconut flour).",
    "honey": "Replace with a keto sweetener (erythritol, allulose, or monk fruit); use a sugar-free honey substitute if you need the syrupy texture.",
    "ketchup": "Use a no-sugar-added / keto ketchup, or tomato paste thinned with vinegar and sweetener.",
    "lentils": "Substitute cooked cauliflower or mushrooms for the texture.",
    "maple syrup": "Use a sugar-free maple-flavored syrup, or a keto sweetener plus a few drops of maple extract.",
    "milk": "Swap for unsweetened almond milk or heavy cream diluted with water.",
    "molasses": "Use a keto brown-sugar blend plus a drop of molasses extract for the flavour.",
    "oats": "Swap for chia/hemp/ground-flax 'noatmeal' - similar texture, far fewer net carbs.",
    "onion": "Onion is fairly high-carb by weight - use about half, or substitute the green tops of scallions/chives for the aromatic flavor at a fraction of the carbs.",
    "pasta": "Swap for zucchini noodles, shirataki (konjac) noodles, or spaghetti squash.",
    "peas": "Use sparingly; green beans or diced zucchini are lower-carb stand-ins.",
    "potato": "Swap for cauliflower, turnip, or radish, which are far lower in carbs.",
    "raisins": "Dried fruit is concentrated sugar - omit, or use a few chopped berries.",
    "rice": "Swap for cauliflower rice (about 3 g net carbs per cup vs ~45 g).",
    "sugar": "Replace with erythritol, allulose, or monk fruit sweetener (zero net carbs).",
    "sweet potato": "Swap for mashed cauliflower or roasted turnip / radish.",
    "toffee candy bar": "Mostly sugar and butter - use a sugar-free chocolate or a few chopped nuts for crunch instead.",
    "tortilla": "Swap for a low-carb tortilla or a large lettuce leaf.",
    "yogurt": "Use full-fat Greek yogurt or sour cream instead of regular yogurt to cut carbs and raise the fat ratio."
  };

  var API = { DB: DB, SWAPS: SWAPS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.NutritionDB = API;
})(typeof self !== "undefined" ? self : this);
