var default_buttons = [
  {text: 'hi', id: 1},
  {text: 'Start Over', load_id: 'root', id: 2},
  {text: 'goodbye', id: 3},
  {text: 'yes', id: 4},
  {text: 'no', id: 5},
  {text: 'How are things?', id: 6},
  {text: 'tell me more', id: 7},
  {text: 'I\'m tired', id: 8},
];

// sharing photos/videos
// love it, that's awesome, so cute, no way
var grids = [
  // afraid, confused
  {id: 'feelings', name: 'feelings', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3ad.svg", buttons: [
    {id: 1, text: "tired"},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "hungry / thirsty"},
    {id: 4, text: "happy"},
    {id: 5, text: "sad"},
    {id: 6, text: "hurt"},
    {id: 7, text: "bored"},
    {id: 8, text: "frustrated"}
  ]},
  // head, eye, throat, mouth, ear, chest, stomach, back, arm, leg, tongue
  // pain scale
  // likert scale
  // medical requests (nurse, suction, temperature, adjust, uncomfortable)
  // pillow, bed, up, down, on stomach, on side, head, arms, pain, okay, itchy, out of bed, uncomfortable, IV, massage, rub, sit up, lay down
  // swab mouth, dry lips, light on/off, washcloth on head, clean glasses, cold, hot, open/close curtain, bathroom, when tube out of mouth
  // leave me alone, listen to music, read book
  // dull, sharp, everywhere, itch, sting, hurts, aches, burns, stuck
  // how am I doing?
  // prayer, don't leave, wash hair, brush teeth, brush hair
  {id: 'body', name: 'body', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f6b6.svg", buttons: [
    {id: 1, text: "head"},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "higher"},
    {id: 4, text: "yes"},
    {id: 5, text: "no"},
    {id: 6, text: "torso"},
    {id: 7, text: "limbs"},
    {id: 8, text: "lower"}
  ]},
  {id: 'requests', name: 'requests', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f5e3.svg", buttons: [
    {id: 1, text: "Tell me a Story"},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "Read to Me"},
    {id: 4, text: "more"},
    {id: 5, text: "done"},
    {id: 6, text: "Sing to Me"},
    {id: 7, text: "How was your Day?"},
    {id: 8, text: "Look at Photos"}
  ]},
  {id: 'religious', name: 'religious', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/26ea.svg", buttons: [
    {id: 1, text: "Pray for me"},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "Read Scripture"},
    {id: 4, text: "faith"},
    {id: 5, text: "God"},
    {id: 6, text: "Sing me a Hymn"},
    {id: 7, text: "How was Meeting?"},
    {id: 8, text: "Study Together"}
  ]},
  {id: 'comments', name: 'comments', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4ac.svg", buttons: [
    {id: 1, text: "I miss you"},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "I can't wait to come Home"},
    {id: 4, text: "I am Scared"},
    {id: 5, text: "Something Hurts"},
    {id: 6, text: "I need a Distraction"},
    {id: 7, text: "I'm Tired of This"},
    {id: 8, text: "What Happens Next?"}
  ]},
  {id: 'nav', name: 'multi-level', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4d8.svg", buttons: [
    {id: 1, text: "requests", load_id: 'requests'},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "comments", load_id: 'comments'},
    {id: 4, text: "yes"},
    {id: 5, text: "no"},
    {id: 6, text: "feelings", load_id: 'feelings'},
    {id: 7, text: "body", load_id: 'body'},
    {id: 8, text: "quick", load_id: 'quick'}
  ]},
  {id: 'keyboard', name: 'keyboard', image_url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2328.svg", buttons: [
    {id: 1, text: "abcde", load_id: 'keyboard2', image_url: ""},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "uvwxyz", load_id: 'keyboard8', image_url: ""},
    {id: 4, text: "12345", load_id: 'keyboard3', image_url: ""},
    {id: 5, text: "67890", load_id: 'keyboard7', image_url: ""},
    {id: 6, text: "fghij", load_id: 'keyboard4', image_url: ""},
    {id: 7, text: "klmno", load_id: 'keyboard5', image_url: ""},
    {id: 8, text: "pqrst", load_id: 'keyboard6', image_url: ""}
  ]},
  {id: 'keyboard2', name: 'keyboard2', skip: true, buttons: [
    {id: 1, text: "+a", load_id: 'root', image_url: ""},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "+e", load_id: 'root', image_url: ""},
    {id: 4, text: "", image_url: ""},
    {id: 5, text: "", image_url: ""},
    {id: 6, text: "+b", load_id: 'root', image_url: ""},
    {id: 7, text: "+c", load_id: 'root', image_url: ""},
    {id: 8, text: "+d", load_id: 'root', image_url: ""}
  ]},
  {id: 'keyboard3', name: 'keyboard3', skip: true, buttons: [
    {id: 1, text: "+1", load_id: 'root', image_url: ""},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "+5", load_id: 'root', image_url: ""},
    {id: 4, text: "", image_url: ""},
    {id: 5, text: "", image_url: ""},
    {id: 6, text: "+2", load_id: 'root', image_url: ""},
    {id: 7, text: "+3", load_id: 'root', image_url: ""},
    {id: 8, text: "+4", load_id: 'root', image_url: ""}
  ]},
  {id: 'keyboard4', name: 'keyboard4', skip: true, buttons: [
    {id: 1, text: "+f", load_id: 'root', image_url: ""},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "+j", load_id: 'root', image_url: ""},
    {id: 4, text: "", image_url: ""},
    {id: 5, text: "", image_url: ""},
    {id: 6, text: "+g", load_id: 'root', image_url: ""},
    {id: 7, text: "+h", load_id: 'root', image_url: ""},
    {id: 8, text: "+i", load_id: 'root', image_url: ""}
  ]},
  {id: 'keyboard5', name: 'keyboard5', skip: true, buttons: [
    {id: 1, text: "+k", load_id: 'root', image_url: ""},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "+o", load_id: 'root', image_url: ""},
    {id: 4, text: "", image_url: ""},
    {id: 5, text: "", image_url: ""},
    {id: 6, text: "+l", load_id: 'root', image_url: ""},
    {id: 7, text: "+m", load_id: 'root', image_url: ""},
    {id: 8, text: "+n", load_id: 'root', image_url: ""}
  ]},
  {id: 'keyboard6', name: 'keyboard6', skip: true, buttons: [
    {id: 1, text: "+p", load_id: 'root', image_url: ""},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "+t", load_id: 'root', image_url: ""},
    {id: 4, text: "", image_url: ""},
    {id: 5, text: "", image_url: ""},
    {id: 6, text: "+qu", load_id: 'root', image_url: ""},
    {id: 7, text: "+r", load_id: 'root', image_url: ""},
    {id: 8, text: "+s", load_id: 'root', image_url: ""}
  ]},
  {id: 'keyboard7', name: 'keyboard7', skip: true, buttons: [
    {id: 1, text: "+6", load_id: 'root', image_url: ""},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "+0", load_id: 'root', image_url: ""},
    {id: 4, text: "", image_url: ""},
    {id: 5, text: "", image_url: ""},
    {id: 6, text: "+7", load_id: 'root', image_url: ""},
    {id: 7, text: "+8", load_id: 'root', image_url: ""},
    {id: 8, text: "+9", load_id: 'root', image_url: ""}
  ]},
  {id: 'keyboard8', name: 'keyboard8', skip: true, buttons: [
    {id: 1, text: "+u", load_id: 'root', image_url: ""},
    {id: 2, text: "Start Over", load_id: 'root', image_url: ""},
    {id: 3, text: "+z", load_id: 'root', image_url: ""},
    {id: 4, text: "+v", load_id: 'root', image_url: ""},
    {id: 5, text: "", image_url: ""},
    {id: 6, text: "+w", load_id: 'root', image_url: ""},
    {id: 7, text: "+x", load_id: 'root', image_url: ""},
    {id: 8, text: "+y", load_id: 'root', image_url: ""}
  ]},
];
grids.push({
  id: 'quick', name: 'quick', skip: true, buttons: default_buttons
});