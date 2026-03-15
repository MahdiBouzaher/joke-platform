// mongo-seed.js — run by mongosh via docker-entrypoint-initdb.d on first startup
db = db.getSiblingDB('jokes_db');

db.types.drop();
db.jokes.drop();

db.types.createIndex({ type: 1 }, { unique: true });

db.types.insertMany([
    { type: 'general' },
    { type: 'knock-knock' },
    { type: 'programming' }
]);

db.jokes.insertMany([
    { setup: "What did the fish say when it hit the wall?",               punchline: "Dam.",                                              type: "general" },
    { setup: "How do you make a tissue dance?",                           punchline: "You put a little boogie on it.",                    type: "general" },
    { setup: "Why can't bicycles stand on their own?",                   punchline: "They are two tired",                                type: "general" },
    { setup: "What do you call a singing Laptop",                        punchline: "A Dell",                                            type: "general" },
    { setup: "How do you organize an outer space party?",                punchline: "You planet",                                        type: "general" },
    { setup: "What's the best time to go to the dentist?",               punchline: "Tooth hurty.",                                      type: "general" },
    { setup: "What do you call a cow with no legs?",                     punchline: "Ground beef!",                                      type: "general" },
    { setup: "What do you call sad coffee?",                             punchline: "Despresso.",                                        type: "general" },
    { setup: "Why did the butcher work extra hours at the shop?",        punchline: "To make ends meat.",                                type: "general" },
    { setup: "Knock knock. Who's there? A broken pencil. A broken pencil who?",  punchline: "Never mind. It's pointless.",               type: "knock-knock" },
    { setup: "Knock knock. Who's there? Cows go. Cows go who?",          punchline: "No, cows go moo.",                                  type: "knock-knock" },
    { setup: "Knock knock. Who's there? Little old lady. Little old lady who?",  punchline: "I didn't know you could yodel!",            type: "knock-knock" },
    { setup: "What's the best thing about a Boolean?",                   punchline: "Even if you're wrong, you're only off by a bit.",   type: "programming" },
    { setup: "What's the object-oriented way to become wealthy?",        punchline: "Inheritance",                                       type: "programming" },
    { setup: "Where do programmers like to hangout?",                    punchline: "The Foo Bar.",                                      type: "programming" },
    { setup: "Why did the programmer quit his job?",                     punchline: "Because he didn't get arrays.",                     type: "programming" },
    { setup: "Why do programmers always mix up Halloween and Christmas?", punchline: "Because Oct 31 == Dec 25",                         type: "programming" },
    { setup: "A SQL query walks into a bar, walks up to two tables and asks...", punchline: "Can I join you?",                           type: "programming" },
    { setup: "How many programmers does it take to change a lightbulb?", punchline: "None that's a hardware problem",                    type: "programming" },
    { setup: "To understand what recursion is...",                       punchline: "You must first understand what recursion is",       type: "programming" },
    { setup: "There are 10 types of people in this world...",            punchline: "Those who understand binary and those who don't",   type: "programming" },
    { setup: "Why do Java programmers wear glasses?",                    punchline: "Because they don't C#",                             type: "programming" }
]);

print('MongoDB seed complete: ' + db.jokes.countDocuments() + ' jokes inserted');
