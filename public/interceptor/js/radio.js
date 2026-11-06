// Note: radio stations and gated lines; the radio is the voice of the world and carries intel.

export const STATIONS = [
  { id: 'cb19', name: 'CB 19', sub: 'truckers' },
  { id: 'kjef', name: 'KJEF 1290', sub: 'St. Jude Brigade' },
  { id: 'pwl', name: 'PERMIAN W&L', sub: 'emergency band' },
  { id: 'llano', name: 'LLANO RELAY', sub: 'Co-op' },
  { id: 'kbon', name: 'KBON 101.1', sub: 'night owl', night: true },
];

const has = (k) => (S) => !!S.flags[k];

// Note: ctx = {night, progress (0 east .. 1 west in this band), trip (0 .. 1 over all acts), act, heat, hunter: {first, last}}; acts limits a line to some bands.
export const LINES = [
  { id: 'cb1', acts: [1], st: 'cb19', when: has('hasSurvey'), text: '...broker shot dead at the motor court on 90, cher... black-and-white Crown Vic pulled out, going west...', fx: { heat: 10, flag: 'copCarKnown' } },
  { id: 'cb2', acts: [1], st: 'cb19', text: '...station past the Vermilion\'s dry, you got to siphon off the wrecks...' },
  { id: 'cb3', acts: [1], st: 'cb19', text: '...bikes on 90 past the Mermentau, toll crew, they want water...' },
  { id: 'cb4', acts: [1], st: 'cb19', when: (S, c) => c.progress > 0.3, text: '...two company Tahoes on the refinery road, Lake Charles side...' },
  { id: 'cb5', st: 'cb19', when: (S, c) => S.flags.hunterHired && c.heat >= 30, text: '...fella in a black Tahoe asking after a cop car, real polite, wouldn\'t give his name...' },
  { id: 'cb6', st: 'cb19', when: (S, c) => S.flags.hunterHired && c.heat >= 45, text: '...tracker\'s paying a jug a sighting, two called in already...' },
  { id: 'cb7', st: 'cb19', when: (S) => S.flags.hunterTrace, text: '...Co-op runner burned out by the road, St. Jude medal on the mirror, same as the last one...' },
  { id: 'cb8', st: 'cb19', when: (S, c) => c.night, text: '...anybody out there rolling... no? ...nobody runs nights no more...' },
  { id: 'cb9', acts: [1], st: 'cb19', when: (S, c) => c.progress > 0.75, text: '...Saints got the Sabine bridge at Vinton, toll\'s whatever they say it is...' },
  { id: 'cb10', acts: [1], st: 'cb19', when: (S, c) => c.progress > 0.15, text: '...Co-op church south of 90, they\'ll give you a little water...' },
  { id: 'kj1', st: 'kjef', text: 'KJEF 1290. Supper at every chapel after evening prayer, for all who kneel.' },
  { id: 'kj2', st: 'kjef', when: has('hasSurvey'), text: (S, c) => `Brother ${c.hunter.last} has gone out after the courier. Any chapel takes the case, no questions.`, fx: { flag: 'hunterHired' } },
  { id: 'kj3', acts: [1], st: 'kjef', text: 'Vinton ration line, Thursdays. Bring a jug.' },
  { id: 'kj4', st: 'kjef', when: has('brigadeWar'), text: 'A brother is dead on the road. That car pays no toll at any gate. Stop it.' },
  { id: 'pw1', st: 'pwl', when: has('hasSurvey'), text: 'To the courier carrying 7-C. Permian W&L is buying. Any district yard.', fx: { flag: 'bidCompany' } },
  { id: 'pw2', acts: [1], st: 'pwl', text: 'Lake Charles district, taps open six to eight. Have your meter card.' },
  { id: 'pw3', st: 'pwl', when: has('companyMet'), text: 'Courier. Our field team has your plate. First table at the Exchange, not the Saints.' },
  { id: 'pw4', acts: [1], st: 'pwl', text: 'Drivers wanted, Lake Charles yard.' },
  { id: 'll1', st: 'llano', text: '...Llano relay... west of the Pecos... three weeks, no truck...' },
  { id: 'll2', st: 'llano', when: has('coopPlea'), text: '...courier, if you\'re hearing... Co-op can\'t match them... we\'re asking, is all...', fx: { flag: 'bidCoop' } },
  { id: 'll3', st: 'llano', text: '...Andrews, Seminole, Denver City... children first, then the old folks...' },
  { id: 'kb1', st: 'kbon', text: 'Doc, KBON 101.1, out of the old mall in Eunice. Still on.' },
  { id: 'kb2', st: 'kbon', text: 'Doc\'s weather, hot again. Driving tonight, run your lights off, windows up.' },
  { id: 'kb3', st: 'kbon', when: has('copCarKnown'), text: 'Caller says a black-and-white went by westbound. Whoever that is, keep going.' },
  { id: 'kb4', st: 'kbon', text: 'Request line is open. Doc\'s at the desk till sunup.' },
  { id: 'cb20', acts: [2], st: 'cb19', text: '...Permian\'s weighing at the Brazos, going through every trunk, keeping what they want...' },
  { id: 'cb21', acts: [2], st: 'cb19', when: (S, c) => c.progress > 0.3, text: '...caltrops on 190 past the Trinity, Co-op boys, they just want water...' },
  { id: 'cb22', acts: [2], st: 'cb19', text: '...Woodville tower\'s dry, folks lining up with cups at noon...' },
  { id: 'll20', acts: [2], st: 'llano', text: '...Woodville relay... tower\'s dry... courier on 190, stop at the line...', fx: { flag: 'coopPlea' } },
  { id: 'cb30', acts: [3], st: 'cb19', text: '...Jacob\'s Well bunch don\'t come to town no more, sitting on something, folks say...' },
  { id: 'pw30', acts: [3], st: 'pwl', text: 'Gillespie County. Survey crews travel under escort. Keep clear of company vehicles.' },
  { id: 'kb30', acts: [3], st: 'kbon', text: 'Fella at the mailbox says the hill people kept the old aquifer maps. Doc wouldn\'t know.' },
  { id: 'cb40', acts: [4], st: 'cb19', text: '...man camp on 385 trades rounds, hand, they won\'t take water...' },
  { id: 'kj40', acts: [4], st: 'kjef', text: 'Andrews, the compound gates open at dawn. Breakfast after prayer.' },
  { id: 'll40', acts: [4], st: 'llano', text: '...Seminole... eleven days on the tank... any truck at all...' },
  { id: 'cb41', acts: [4], st: 'cb19', when: (S, c) => S.hunter === 'hunting' && c.heat >= 40, text: '...black Tahoe filling up in Odessa, hand, asking for you by name...' },
  { id: 'kb50', acts: [5], st: 'kbon', text: 'Doc again. Tower on the ridge still transmits, if anybody has something to say. Doc\'s at the mall.' },
  { id: 'pw50', acts: [5], st: 'pwl', when: has('hasSurvey'), text: 'Permian W&L, first table at the Exchange. Courier, we are waiting.' },
  { id: 'cb50', acts: [5], st: 'cb19', text: '...Exchange, mijo, three tables, one door, guards shoot whoever draws...' },
  { id: 'kj50', acts: [5], st: 'kjef', when: has('brigadeWar'), text: 'No Saint sits at a table with the courier. Not at the Exchange, not anywhere.' },
  { id: 'kb5', st: 'kbon', when: has('hunterHired'), text: (S, c) => `Heard St. Jude put ${c.hunter.first} ${c.hunter.last} on somebody's trail. Doc knew him, years back.` },
];

const hunting = (S) => !!S.flags.hunterHired && S.hunter === 'hunting';
const ALL_BUT_5 = [1, 2, 3, 4];

// Note: ambient chatter after the story lines run out: k is a stable key for the rotation, {slot} is filled from SLOTS, night false means day only; never fx.
export const CHATTER = [
  // Note: CB 19, any act.
  { k: 'c0a', st: 'cb19', text: '...breaker one-nine, anybody got diesel, I can trade...' },
  { k: 'c0b', st: 'cb19', text: '...copy, copy that, go ahead...' },
  { k: 'c0c', st: 'cb19', text: '...negative, the bridge is... say again...' },
  { k: 'c0d', st: 'cb19', text: '{handle}, you got your ears on? ...{handle}...' },
  { k: 'c0e', st: 'cb19', text: '...pumps dry at mile {mile}, don\'t pull in...' },
  { k: 'c0f', st: 'cb19', text: '...westbound, looking for {part}, can do {jugs}...' },
  { k: 'c0g', st: 'cb19', text: '...that wreck at mile {mile}, already stripped, tires and all...' },
  { k: 'c0h', st: 'cb19', text: '{handle2}, {handle}. You make it to {west}?' },
  { k: 'c0i', st: 'cb19', night: false, text: '...dash says {temp}, I\'m pulling off till it cools...' },
  { k: 'c0j', st: 'cb19', night: true, text: '...anybody up... {handle}, mile {mile}...' },
  { k: 'c0k', st: 'cb19', night: true, text: '...running dark since mile {mile}, two more doing it too...' },
  { k: 'c0l', st: 'cb19', night: true, text: '...Doc\'s on 101.1, if you want somebody talking...' },
  // Note: CB 19, the Gulf: Cajun and Southeast Texas.
  { k: 'c1a', st: 'cb19', acts: [1], text: '...{jugs} for the Crowley tow, cher. I know. I know it.' },
  { k: 'c1b', st: 'cb19', acts: [1], text: '{handle}, you crossed the Mermentau yet, cher, or you still...' },
  { k: 'c1c', st: 'cb19', acts: [1], text: '...rice gone to salt all down the Mermentau, my nonc\'s too...' },
  { k: 'c1d', st: 'cb19', acts: [1], text: '...gator on the shoulder at mile {mile}, big one, just let him lay...' },
  { k: 'c1e', st: 'cb19', acts: [1], text: '...Calcasieu bridge, rail\'s out on the east side, stay center, cher...' },
  { k: 'c1f', st: 'cb19', acts: [1], text: '...she\'s gonna pass by Lake Charles Thursday, make groceries if they got any...' },
  { k: 'c1g', st: 'cb19', acts: [1], night: true, when: (S, c) => (c.progress ?? 0) > 0.6, text: '...you hear that, {handle}? Hymns again, out by Vinton...' },
  { k: 'c1h', st: 'cb19', acts: [1], text: '...nonc says the levee road\'s open at Crowley. I wouldn\'t, me...' },
  // Note: CB 19, the Piney Woods: East Texas.
  { k: 'c2a', st: 'cb19', acts: [2], text: '...fixing to cross at the Trinity, {handle}, you copy...' },
  { k: 'c2b', st: 'cb19', acts: [2], text: '...log truck still laying over at mile {mile}. Go round right, left side\'s soft.' },
  { k: 'c2c', st: 'cb19', acts: [2], text: '...liked to lost a tire past Jasper, {handle}, them holes...' },
  { k: 'c2d', st: 'cb19', acts: [2], text: '...smoke north of the Neches, been a week now, out toward the Big Thicket...' },
  { k: 'c2e', st: 'cb19', acts: [2], text: '...somebody up in the stand by the deer camp, I seen the glass shine...' },
  { k: 'c2f', st: 'cb19', acts: [2], text: '...Huntsville wants your registration at the yard, the paper one...' },
  { k: 'c2g', st: 'cb19', acts: [2], night: true, text: '...pines popping all night out here... no, I locked it...' },
  { k: 'c2h', st: 'cb19', acts: [2], text: '...Woodville line, bring your own cup, they ain\'t got cups...' },
  // Note: CB 19, the Hill Country.
  { k: 'c3a', st: 'cb19', acts: [3], text: '...stock tank\'s dry at the Hoffmann place, they\'re hauling from the river...' },
  { k: 'c3b', st: 'cb19', acts: [3], text: '...low-water crossing past mile {mile}, it\'s dry, drive the bed...' },
  { k: 'c3c', st: 'cb19', acts: [3], text: '...caliche on 290 from mile {mile}, knock your filter out at Fredericksburg...' },
  { k: 'c3d', st: 'cb19', acts: [3], text: '...Kothmann\'s goats on the road again, {handle}, go slow by the pens...' },
  { k: 'c3e', st: 'cb19', acts: [3], text: '...Junction, they want you kneeling at the counter or it\'s double, and the double was...' },
  { k: 'c3f', st: 'cb19', acts: [3], text: '...cedar choppers on the Pedernales road, trading posts for water...' },
  { k: 'c3g', st: 'cb19', acts: [3], night: true, text: '...dry lightning out west of Fredericksburg, nothing behind it, no...' },
  { k: 'c3h', st: 'cb19', acts: [3], text: '...{handle}, them old German places got cisterns still. Won\'t say where...' },
  // Note: CB 19, the Permian: oilfield West Texas.
  { k: 'c4a', st: 'cb19', acts: [4], text: '...pumper still making his rounds east of Odessa, company keeps him on...' },
  { k: 'c4b', st: 'cb19', acts: [4], text: '...lease road at mile {mile}, cattle guard\'s gone, go round...' },
  { k: 'c4c', st: 'cb19', acts: [4], text: '...sand over 385 at mile {mile}, foot deep, keep it rolling, hand...' },
  { k: 'c4d', st: 'cb19', acts: [4], text: '{handle}, you on hitch? ...no, not by Andrews, Saints got the road...' },
  { k: 'c4e', st: 'cb19', acts: [4], text: '...{rounds} for five gallons at the man camp, that\'s what he said...' },
  { k: 'c4f', st: 'cb19', acts: [4], night: true, text: '...flares lit from mile {mile} to Kermit, {handle}, the whole...' },
  { k: 'c4g', st: 'cb19', acts: [4], text: '...hand, don\'t drink out the frac tanks, I don\'t care how clear it looks...' },
  // Note: CB 19, the Mesas: New Mexico.
  { k: 'c5a', st: 'cb19', acts: [5], text: '...arroyo at mile {mile}, it\'s dry, ya, just slow for the lip...' },
  { k: 'c5b', st: 'cb19', acts: [5], text: '...you see the antelope past Lovington? Three, by the fence...' },
  { k: 'c5c', st: 'cb19', acts: [5], text: '...mijo, Hobbs takes chits first, then water, then rounds...' },
  { k: 'c5d', st: 'cb19', acts: [5], night: false, text: '...wind on 62 put two trailers over by mile {mile}, pues, afternoons it\'s bad...' },
  { k: 'c5e', st: 'cb19', acts: [5], text: '...road ends in rock past the Exchange, you got to turn around there...' },
  { k: 'c5f', st: 'cb19', acts: [5], night: true, text: '...cold up here, ahorita it\'s like fifty...' },
  // Note: CB 19, after something happened.
  { k: 'cxa', st: 'cb19', when: has('copCarKnown'), text: '...third one today asking me about a black-and-white...' },
  { k: 'cxb', st: 'cb19', when: (S, c) => hunting(S) && (c.heat ?? 0) >= 25, text: '...black Tahoe at mile {mile}, parked, nobody got out...' },
  { k: 'cxc', st: 'cb19', when: has('hunterTrace'), text: '...another one burned at mile {mile}, Co-op plates...' },
  { k: 'cxd', st: 'cb19', acts: [1, 2], when: has('checkpointFight'), text: '...an hour to cross the Sabine now, since the shooting...' },
  { k: 'cxe', st: 'cb19', acts: [2, 3], when: has('weighFight'), text: '...they\'re opening every trunk at the Brazos now...' },
  { k: 'cxf', st: 'cb19', when: has('brigadeWar'), text: '...Saints in every town now, looking at cars...' },
  { k: 'cxg', st: 'cb19', acts: [2, 3], when: has('gaveTown'), text: '...somebody left water at the Woodville line, folks still on about it...' },
  { k: 'cxh', st: 'cb19', acts: [4, 5], when: has('gaveSeminole'), text: '...somebody stopped at Seminole, left water...' },
  { k: 'cxi', st: 'cb19', acts: [3], when: has('residentsCall'), text: '...that was Jacob\'s Well on nineteen? They don\'t ever...' },

  // Note: KJEF, the Brigade's announcer.
  { k: 'j0a', st: 'kjef', text: '...Matthew five, verse six... they which do hunger and thirst...' },
  { k: 'j0b', st: 'kjef', text: '...supper\'s at six, after the prayer, line up on the east side...' },
  { k: 'j0c', st: 'kjef', acts: ALL_BUT_5, text: 'Ration line at the {brigadeTown} chapel opens at {hour}. Children first, then {cups} a head.' },
  { k: 'j0d', st: 'kjef', text: '...Psalm sixty-three, verse one... in a dry and thirsty land, where no water is...' },
  { k: 'j0e', st: 'kjef', text: 'Lost, blue Igloo cooler, Brigade property, mile {mile} on {road}. Bring it to the chapel.' },
  { k: 'j0f', st: 'kjef', text: 'Mechanics, bring your own tools to any chapel. Meals and water for the work.' },
  { k: 'j0g', st: 'kjef', acts: ALL_BUT_5, text: 'Convoy leaves {brigadeTown} at first light. Pull over for it.' },
  { k: 'j0h', st: 'kjef', text: 'Tolls on Brigade roads in water or rounds. Company chits are not taken.' },
  { k: 'j0i', st: 'kjef', night: true, text: '...for the drivers, for the sick, for the ones on the road tonight... amen.' },
  { k: 'j0j', st: 'kjef', night: true, text: 'Night watch is posted. Gates open at dawn, not before.' },
  { k: 'j0k', st: 'kjef', acts: ALL_BUT_5, text: 'Names of the dead are read Sunday at {brigadeTown}. Bring the names you have.' },
  { k: 'j1a', st: 'kjef', acts: [1], text: 'Vinton chapel needs sandbags filled. Two cups a day for the work.' },
  { k: 'j2a', st: 'kjef', acts: [2], text: 'Livingston chapel needs a man who knows generators. Ask for Brother Hollis.' },
  { k: 'j3a', st: 'kjef', acts: [3], text: 'Junction, Sunday service is at the garage. Bring a chair.' },
  { k: 'j4a', st: 'kjef', acts: [4], text: 'Andrews compound, noon meal. Line at the east gate. Bring a cup.' },
  { k: 'j5a', st: 'kjef', acts: [5], text: 'Faithful on 62, the camp is at the old rest stop past Hobbs. Water at noon.' },
  { k: 'jxa', st: 'kjef', when: (S) => !!S.flags.brigadeBlood && !S.flags.brigadeWar, text: 'A brother was killed on {road} this week. Service Sunday at the chapel.' },
  { k: 'jxb', st: 'kjef', acts: [1, 2], when: has('checkpointFight'), text: 'Sabine toll is doubled. Pay at the bridge or at the Vinton chapel.' },
  { k: 'jxc', st: 'kjef', when: (S, c) => hunting(S) && !!S.flags.copCarKnown && (c.heat ?? 0) >= 35, text: 'Any black-and-white Crown Vic, report it at a chapel. Brother {hunterLast} will come by.' },
  { k: 'jxd', st: 'kjef', when: (S) => S.hunter === 'dead', text: 'Brother {hunterLast} will be buried Sunday. Every Saint who can drive.' },

  // Note: Permian W&L, the bulletin reader.
  { k: 'p0a', st: 'pwl', text: '...meter cards at the window, have them out...' },
  { k: 'p0b', st: 'pwl', text: '...stand by for the noon bulletin...' },
  { k: 'p0c', st: 'pwl', text: 'Meter readings for the {companyTown} district are due Friday.' },
  { k: 'p0d', st: 'pwl', text: 'Tap hours, {companyTown} district, {hour} to {hour2}. Bring your meter card.' },
  { k: 'p0e', st: 'pwl', text: 'Allotment today is {gallons} gallons per registered household.' },
  { k: 'p0f', st: 'pwl', text: 'Torn or faded chits will not be honored at depots.' },
  { k: 'p0g', st: 'pwl', text: 'Report broken meters to your district yard. Do not open the housing.' },
  { k: 'p0h', st: 'pwl', text: 'Convoys have right of way on state highways. Pull to the shoulder.' },
  { k: 'p0i', st: 'pwl', text: 'This is a test of the Permian emergency band. ...This has been a test.' },
  { k: 'p0j', st: 'pwl', night: true, text: 'Curfew in company districts, nine to five.' },
  { k: 'p0k', st: 'pwl', text: 'Boil notice, {companyTown} district. One full minute.' },
  { k: 'p0l', st: 'pwl', acts: [2, 3, 4, 5], text: 'Hiring at the {companyTown} yard. Drivers, guards, meter readers.' },
  { k: 'p1a', st: 'pwl', acts: [1], text: 'Lake Charles plant at half capacity. Low pressure after noon.' },
  { k: 'p2a', st: 'pwl', acts: [2], text: 'Huntsville depot open Monday and Thursday. Proof of registration.' },
  { k: 'p3a', st: 'pwl', acts: [3], text: 'Gillespie County, no drilling without a company permit. Existing wells are to be registered.' },
  { k: 'p4a', st: 'pwl', acts: [4], text: 'Lease roads off 385 are closed to private vehicles.' },
  { k: 'p4b', st: 'pwl', acts: [4], text: 'Odessa yard, shift change at six. Keep clear of the gate.' },
  { k: 'p5a', st: 'pwl', acts: [5], text: 'Hobbs district tap hours unchanged. Texas meter cards are valid.' },
  { k: 'pxa', st: 'pwl', acts: [2, 3], when: has('weighFight'), text: 'Brazos weigh station is closed to private vehicles until further notice.' },
  { k: 'pxb', st: 'pwl', when: has('companyMet'), text: 'Field teams, the courier is not to be stopped without orders from the district yard.' },

  // Note: Llano relay, the Co-op operator.
  { k: 'l0a', st: 'llano', text: '...relay, can anybody copy... anybody...' },
  { k: 'l0b', st: 'llano', text: '...relay... you\'re breaking up... repeat...' },
  { k: 'l0c', st: 'llano', text: '...{far} relay... {days} days on the tank... {days}...' },
  { k: 'l0d', st: 'llano', text: '...pump seal, three-inch... we can pay in eggs...' },
  { k: 'l0e', st: 'llano', text: '...truck didn\'t come to {far} again... line\'s two hundred...' },
  { k: 'l0f', st: 'llano', text: '...relay check... Plains... Tatum... Morton... Morton, come in...' },
  { k: 'l0g', st: 'llano', text: '...{far}, a girl, eight, insulin... it has to stay cold...' },
  { k: 'l0h', st: 'llano', text: '...{far} and {far2} on one well this month...' },
  { k: 'l0i', st: 'llano', text: '...drivers with their own trucks... the towns will feed you...' },
  { k: 'l0j', st: 'llano', night: true, text: '...{far} lights a barrel on the tower nights, for the trucks...' },
  { k: 'l0k', st: 'llano', night: true, text: '...night relay... nothing to report... still here...' },
  { k: 'l1a', st: 'llano', acts: [1], text: '...Crowley relay... families walking out on 90...' },
  { k: 'l2a', st: 'llano', acts: [2], text: '...Jasper relay... Neches is low... boil it twice...' },
  { k: 'l3a', st: 'llano', acts: [3], text: '...Bastrop relay... trucks parked... no diesel since spring...' },
  { k: 'l4a', st: 'llano', acts: [4], text: '...Iraan relay... garage does Co-op trucks, bring your own parts...' },
  { k: 'l5a', st: 'llano', acts: [5], text: '...Lovington relay... beds and shade... water for one night...' },
  { k: 'lxa', st: 'llano', acts: [2, 3, 4, 5], when: has('gaveTown'), text: '...Woodville says somebody gave at the line... thank you, whoever...' },
  { k: 'lxb', st: 'llano', acts: [4, 5], when: has('gaveSeminole'), text: '...Seminole... eleven days and a morning...' },
  { k: 'lxc', st: 'llano', acts: [1, 2], when: has('gaveFamily'), text: '...family from 90 made it to the church... somebody gave them water...' },

  // Note: KBON, Doc at night.
  { k: 'k0a', st: 'kbon', text: '...Doc\'s still here, if anybody...' },
  { k: 'k0b', st: 'kbon', text: 'Doc\'s on till sunup, then the generator goes off.' },
  { k: 'k0c', st: 'kbon', text: 'Doc here. Food court clock says {clock}.' },
  { k: 'k0d', st: 'kbon', text: 'Generator\'s on {gallons} gallons a night. About {days} nights left in the drum.' },
  { k: 'k0e', st: 'kbon', text: 'It was {temp} here at noon. Down to {coldTemp} by morning.' },
  { k: 'k0f', st: 'kbon', text: 'Found two cans of peaches in the Sears stockroom, back behind the shoe boxes.' },
  { k: 'k0g', st: 'kbon', text: 'Doc checks the mailbox at the front door at noon, if anybody wants to write.' },
  { k: 'k0h', st: 'kbon', text: 'Last box of records went for a truck battery in the spring, so it\'s talk tonight.' },
  { k: 'k0i', st: 'kbon', text: 'Doc counted three cars on 62 from the roof today, all going west.' },
  { k: 'k0j', st: 'kbon', text: 'Fossil shell on the desk. Permian Sea. Found it behind the JCPenney.' },
  { k: 'k0k', st: 'kbon', acts: [1, 2], text: 'If you hear Doc out east, you\'re on the edge of it. Turn it up some.' },
  { k: 'k3a', st: 'kbon', acts: [3], text: 'Somebody says it rained on the Pedernales last week. Doc would like to hear from them.' },
  { k: 'k4a', st: 'kbon', acts: [4], text: 'Road report. Sand on 385 past Seminole, about a foot, keep your speed up.' },
  { k: 'k5a', st: 'kbon', acts: [5], text: 'Doc was up the ridge Tuesday to check the tower guy wires.' },
  { k: 'k5b', st: 'kbon', acts: [5], text: 'Road report. 62 is open from Hobbs to the state line, nobody\'s called in different.' },
  { k: 'kxa', st: 'kbon', when: has('docWater'), text: 'Doc\'s down to the rain barrel on the roof since the two jugs went.' },
  { k: 'kxb', st: 'kbon', acts: [4, 5], when: has('brigadeWar'), text: 'Saints are stopping every car between here and Andrews, both directions.' },
  { k: 'kxc', st: 'kbon', when: (S, c) => hunting(S) && (c.heat ?? 0) >= 40, text: 'Caller says a black Tahoe is filling up at every station going west.' },
  { k: 'kxd', st: 'kbon', when: has('copCarKnown'), text: '...second call tonight about that black-and-white... no, westbound, he said...' },
];

// Note: template fillers per act; the courier's band decides handles, towns and the road number.
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
const HANDLES = ['Rooster', 'Big Tex', 'Deacon', 'Catfish', 'Night Train', 'Hambone', 'Short Haul', 'Lonesome'];
const LOCAL_HANDLES = {
  1: ['Boudreaux', 'T-Bob', 'Crawdad', 'Pelican', 'Cher Marie'],
  2: ['Pine Knot', 'Big Thicket', 'Woodpecker', 'Sawlog'],
  3: ['Dutchman', 'Cedar Chopper', 'Billy Goat', 'Pecan'],
  4: ['Roughneck', 'Pumper', 'Sand Dog', 'Caprock'],
  5: ['Roadrunner', 'Red Dirt', 'Mesa', 'Green Chile'],
};
const ROADS = { 1: '90', 2: '190', 3: '290', 4: '385', 5: '62' };
const COMPANY_TOWNS = { 1: 'Lake Charles', 2: 'Huntsville', 3: 'Fredericksburg', 4: 'Odessa', 5: 'Hobbs' };
const BRIGADE_TOWNS = { 1: 'Vinton', 2: 'Livingston', 3: 'Junction', 4: 'Andrews' };
const FAR_TOWNS = ['Denver City', 'Plains', 'Tatum', 'Seagraves', 'Brownfield', 'Morton', 'Lamesa'];
const WEST_TOWNS = ['Lubbock', 'Midland', 'El Paso', 'Amarillo', 'Roswell'];
const PARTS = ['a 225/60 tire', 'a group 65 battery', 'a radiator hose', 'a fuel pump for a 4.6', 'a serpentine belt', 'a 4R70W'];
const CLOCKS = ['ten past four', 'twenty to two', 'half past six', 'quarter to nine', 'five after eleven'];

const pick = (rand, arr) => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
const int = (rand, lo, hi) => lo + Math.min(hi - lo, Math.floor(rand() * (hi - lo + 1)));
const other = (rand, arr, not) => pick(rand, arr.filter((x) => x !== not));
const actN = (c) => (ROADS[c.act] ? c.act : 1);
const handles = (c) => [...HANDLES, ...LOCAL_HANDLES[actN(c)]];

// Note: a slot is (rand, ctx, values so far) => text; a slot used twice in one line keeps its first value.
const SLOTS = {
  handle: (r, c, v) => other(r, handles(c), v.handle2),
  handle2: (r, c, v) => other(r, handles(c), v.handle),
  mile: (r) => String(int(r, 4, 240)),
  road: (r, c) => ROADS[actN(c)],
  jugs: (r) => `${NUM[int(r, 2, 4)]} jugs`,
  rounds: (r) => `${NUM[pick(r, [8, 10, 12])]} rounds`,
  cups: (r) => pick(r, ['one cup', 'two cups']),
  gallons: (r) => NUM[int(r, 3, 12)],
  days: (r) => NUM[int(r, 3, 14)],
  hour: (r) => NUM[int(r, 5, 8)],
  hour2: (r, c, v) => NUM[NUM.indexOf(v.hour ?? 'six') + 2],
  temp: (r) => String(int(r, 101, 113)),
  coldTemp: (r) => String(int(r, 44, 58)),
  clock: (r) => pick(r, CLOCKS),
  part: (r) => pick(r, PARTS),
  far: (r, c, v) => other(r, FAR_TOWNS, v.far2),
  far2: (r, c, v) => other(r, FAR_TOWNS, v.far),
  west: (r) => pick(r, WEST_TOWNS),
  companyTown: (r, c) => COMPANY_TOWNS[actN(c)],
  brigadeTown: (r, c) => BRIGADE_TOWNS[actN(c)] || 'Andrews',
  hunterLast: (r, c) => c.hunter?.last || 'Jude',
};

function renderChatter(text, ctx, rand) {
  const v = {};
  return text.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in v)) v[k] = SLOTS[k] ? SLOTS[k](rand, ctx, v) : m;
    return v[k];
  });
}

export function chatterPool(S, stationId, ctx) {
  const act = ctx.act ?? 1;
  return CHATTER.filter((l) => l.st === stationId && (!l.acts || l.acts.includes(act))
    && (l.night == null || l.night === !!ctx.night) && (!l.when || l.when(S, ctx)));
}

const RECENT_MAX = 40;

// Note: per station, unplayed lines go first; a spent pool starts a new cycle that never opens on the line just played.
function chatter(S, stationId, ctx, rand) {
  const pool = chatterPool(S, stationId, ctx);
  if (!pool.length) return null;
  const R = S.radio;
  if (!R.recent || typeof R.recent !== 'object' || Array.isArray(R.recent)) R.recent = {};
  let played = Array.isArray(R.recent[stationId]) ? R.recent[stationId] : [];
  const keys = new Set(pool.map((l) => l.k));
  let opts = pool.filter((l) => !played.includes(l.k));
  if (!opts.length) {
    const last = played[played.length - 1];
    played = played.filter((k) => !keys.has(k));
    opts = pool.length > 1 ? pool.filter((l) => l.k !== last) : pool;
  }
  const line = pick(rand, opts);
  played = [...played.filter((k) => k !== line.k), line.k];
  // Note: over the cap, keys of lines that are not eligible right now go first.
  while (played.length > RECENT_MAX) {
    const i = played.findIndex((k) => !keys.has(k));
    played.splice(Math.max(0, i), 1);
  }
  R.recent[stationId] = played;
  return { id: null, key: line.k, text: renderChatter(line.text, ctx, rand), fx: null };
}

// Note: the Co-op relay reaches from the west; it is faint at the Gulf end.
export function signalOf(stationId, ctx) {
  const trip = ctx.trip ?? ctx.progress;
  if (stationId === 'llano') return 0.25 + 0.7 * trip;
  // Note: Doc broadcasts from Eunice, so KBON grows stronger the farther west the courier gets.
  if (stationId === 'kbon') return ctx.night ? 0.5 + 0.45 * trip : 0;
  if (stationId === 'kjef') return 0.5 + 0.5 * Math.min(1, trip * 2.5);
  return 0.85;
}

export function nextLine(S, stationId, ctx, rand) {
  const st = STATIONS.find((s) => s.id === stationId);
  if (!st || (st.night && !ctx.night)) return null;
  for (const line of LINES) {
    if (line.st !== stationId || S.radio.heard[line.id]) continue;
    if (line.acts && !line.acts.includes(ctx.act ?? 1)) continue;
    if (line.when && !line.when(S, ctx)) continue;
    return { id: line.id, text: typeof line.text === 'function' ? line.text(S, ctx) : line.text, fx: line.fx || null };
  }
  return chatter(S, stationId, ctx, rand);
}
