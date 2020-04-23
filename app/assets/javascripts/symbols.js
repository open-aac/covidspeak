var symbols = {};
(function() {
  var lessonpix = {
    'hi': "https://lessonpix.com/drawings/858816/150x150/858816.png",
    'goodbye': "https://lessonpix.com/drawings/44246/150x150/44246.png",
    'yes': "https://lessonpix.com/drawings/13097/150x150/13097.png",
    'no': "https://lessonpix.com/drawings/13178/150x150/13178.png",
    'how are things?': "https://lessonpix.com/drawings/9560/150x150/9560.png",
    'tell me more': "https://lessonpix.com/drawings/34535/150x150/34535.png",
    "I'm tired": "https://lessonpix.com/drawings/509/150x150/509.png",
    "tired": "https://lessonpix.com/drawings/509/150x150/509.png",
    "hungry / thirsty": "https://lessonpix.com/drawings/1813/150x150/1813.png",
    "happy": "https://lessonpix.com/drawings/18080/150x150/18080.png",
    "sad": "https://lessonpix.com/drawings/1695/150x150/1695.png",
    "hurt": "https://lessonpix.com/drawings/84399/100x100/84399.png",
    "bored": "https://lessonpix.com/drawings/713417/150x150/713417.png",
    "frustrated": "https://lessonpix.com/drawings/113206/150x150/113206.png",
    "head": "https://lessonpix.com/drawings/6844/150x150/6844.png",
    "higher": "https://lessonpix.com/drawings/812/150x150/812.png",
    "torso": "https://lessonpix.com/drawings/515/150x150/515.png",
    "limbs": "https://lessonpix.com/drawings/9729/150x150/9729.png",
    "lower": "https://lessonpix.com/drawings/816/150x150/816.png",
    "Tell me a Story": "https://lessonpix.com/drawings/7369/150x150/7369.png",
    "Read to Me": "https://lessonpix.com/drawings/6012/150x150/6012.png",
    "more": "https://lessonpix.com/drawings/850/150x150/850.png",
    "done": "https://lessonpix.com/drawings/13178/150x150/13178.png",
    "Sing to Me": "https://lessonpix.com/drawings/1090436/150x150/1090436.png",
    "How was your Day?": "https://lessonpix.com/drawings/211740/150x150/211740.png",
    "Look at Photos": "https://lessonpix.com/drawings/9320/100x100/9320.png",
    "Pray for me": "https://lessonpix.com/drawings/36126/150x150/36126.png",
    "Read Scripture": "https://lessonpix.com/drawings/111111/150x150/111111.png",
    "faith": "https://lessonpix.com/drawings/10646/150x150/10646.png",
    "God": "https://lessonpix.com/drawings/113650/150x150/113650.png",
    "Sing me a Hymn": "https://lessonpix.com/drawings/1090434/150x150/1090434.png",
    "How was Meeting?": "https://lessonpix.com/drawings/44810/150x150/44810.png",
    "Study Together": "https://lessonpix.com/drawings/6937/150x150/6937.png",
    "I miss you": "https://lessonpix.com/drawings/33676/150x150/33676.png",
    "I can't wait to come Home": "https://lessonpix.com/drawings/126/150x150/126.png",
    "I am Scared": "https://lessonpix.com/drawings/33516/150x150/33516.png",
    "Something Hurts": "https://lessonpix.com/drawings/84399/100x100/84399.png",
    "I need a Distraction": "https://lessonpix.com/drawings/94963/150x150/94963.png",
    "I'm Tired of This": "https://lessonpix.com/drawings/6576/150x150/6576.png",
    "What Happens Next?": "https://lessonpix.com/drawings/11213/150x150/11213.png",
    "requests": "https://lessonpix.com/drawings/234158/150x150/234158.png",
    "comments": "https://lessonpix.com/drawings/130397/150x150/130397.png",
    "feelings": "https://lessonpix.com/drawings/4720/150x150/4720.png",
    "body": "https://lessonpix.com/drawings/1354/150x150/1354.png",
    "quick": "https://lessonpix.com/drawings/1680702/150x150/1680702.png",
  };
  var twemoji = {
    'hi': "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3fe.svg",
    'goodbye': "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f697.svg",
    'yes': "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2705.svg",
    'no': "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/26d4.svg",
    'how are things?': "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f46b.svg",
    'tell me more': "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f62e.svg",
    "I'm tired": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f611.svg",
    "tired": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f611.svg",
    "hungry / thirsty": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f60b.svg",
    "happy": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f642.svg",
    "sad": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2639.svg",
    "hurt": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f915.svg",
    "bored": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f62b.svg",
    "frustrated": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f620.svg",
    "head": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f64d.svg",
    "higher": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2b06.svg",
    "torso": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f930-1f3fc.svg",
    "limbs": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f9b5-1f3fe.svg",
    "lower": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2b07.svg",
    "Tell me a Story": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4da.svg",
    "Read to Me": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4d8.svg",
    "more": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4f6.svg",
    "done": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f645-200d-2642-fe0f.svg",
    "Sing to Me": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3b6.svg",
    "How was your Day?": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/26c5.svg",
    "Look at Photos": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f5bc.svg",
    "Pray for me": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f64f.svg",
    "Read Scripture": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4d9.svg",
    "faith": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f9ed.svg",
    "God": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2600.svg",
    "Sing me a Hymn": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3bc.svg",
    "How was Meeting?": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/26ea.svg",
    "Study Together": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4d6.svg",
    "I miss you": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f614.svg",
    "I can't wait to come Home": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3e1.svg",
    "I am Scared": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f628.svg",
    "Something Hurts": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f915.svg",
    "I need a Distraction": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4fa.svg",
    "I'm Tired of This": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f62b.svg",
    "What Happens Next?": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/27a1.svg",
    "requests": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f5e3.svg",
    "comments": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4ac.svg",
    "feelings": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3ad.svg",
    "body": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f6b6.svg",
    "quick": "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4dc.svg",
  };
  libraries = [{key: 'lessonpix', list: lessonpix}, {key: 'twemoji', list: twemoji}];
  libraries.forEach(function(lib) {
    for(var key in lib.list) {
      symbols['en'] = symbols['en'] || {};
      symbols['en'][key.toLowerCase()] = symbols['en'][key.toLowerCase()] || {};
      symbols['en'][key.toLowerCase()][lib.key] = lib.list[key];
    }
  });  

  for(var key in symbols['en']) {
    if(!symbols['en'][key]['lessonpix']) {
      console.log("missing keyed symbol for lessonpix", key);
    }
    if(!symbols['en'][key]['twemoji']) {
      console.log("missing keyed symbol for twemoji", key);
    }
  }
})();