// Note: the catalogue of invented names for the campaign's people and the pure helper that draws from it, with no DOM, Phaser or state.

import { rng as makeRng, seedFromString } from '../rand.js';

const w = (s) => s.split(/\s+/).filter(Boolean);

// Note: every figure of the Tombstone years and every frontier legend a surname must never recall; tests check the whole catalogue against these lists.
export const FORBIDDEN_NAMES = [
  'Earp', 'Clanton', 'McLaury', 'McLowery', 'Behan', 'Ringo', 'Brocius', 'Holliday', 'Masterson', 'Spence', 'Stilwell', 'Goodfellow',
  'Slaughter', 'Schieffelin', 'Gird', 'Hooker', 'Kinnear', 'Corbin', 'Parsons', 'Claiborne', 'Cruz', 'Bisbee', 'Galey', 'Fly', 'Hereford',
  'Spangenberg', 'Vermillion', 'Geronimo', 'Cochise', 'Victorio', 'Naiche', 'Nachez', 'Alchesay', 'Cashman', 'Clum', 'Spicer', 'Blaylock',
  'Haroney', 'Hafford', 'Swilling', 'Rickabaugh', 'Mather', 'Bassett', 'Diehl', 'McMaster', 'Hickok', 'Bonney', 'Hardin', 'Courtright',
  'Tilghman', 'Longabaugh', 'Cassidy', 'Dalton', 'Younger', 'Ketchum', 'Garrett', 'Oakley', 'Crabtree',
  'Doolin', 'Murrieta', 'Chisum', 'Stoudenmire', 'Plummer', 'Langtry', 'Jeffords', 'Sieber', 'Siringo', 'Buntline', 'Tubman', 'Juárez',
  'Kilpatrick', 'Selman', 'Scarborough', 'Ikard', 'Breakenridge', 'Strauss', 'Mangas', 'Ulzana', 'Eskiminzin', 'Delshay', 'Lozen',
  'Chisholm', 'Gatling', 'Poston', 'Benteen', 'Olinger', 'Tunstall', 'McSween',
];
// Note: given names that are a legend by themselves.
export const FORBIDDEN_FIRST = ['Wyatt', 'Geronimo', 'Cochise', 'Ringo', 'Chato', 'Loco', 'Nana', 'Juh', 'Elfego', 'Tiburcio', 'Quanah', 'Manuelito', 'Pancho', 'Calamity'];
// Note: first and last together; common surnames appear here only as a pair, so they stay usable for other first names.
// Note: a surname that is a place on the map (Starr, Custer, Boone, Fargo) is kept out of the book instead of being listed above.
export const FORBIDDEN_FULL = [
  'Marshall Williams', 'Fred Dodge', 'Fred White', 'Milt Joyce', 'Harry Woods', 'Bob Paul', 'Jim Crane', 'Zwing Hunt', 'Johnny Barnes',
  'Dave Estes', 'Luke Short', 'Frank Leslie', 'Billy Leonard', 'Harry Head', 'Jim Hughes', 'Billy Grounds', 'John Clark', 'Dick Clark',
  'Johnny Ringo', 'Curly Bill', 'Sherman McMaster', 'Pony Diehl', 'Ben Thompson', 'Bill Cody', 'Buffalo Bill', 'Jesse James', 'Frank James',
  'Pat Garrett', 'Billy Kid', 'Wild Bill', 'Bat Masterson', 'Wes Hardin', 'John Hardin', 'George Parsons', 'Wells Spicer', 'Tom Fitch',
  'Camillus Fly', 'Texas Jack', 'Indian Charlie', 'Apache Kid', 'Josephine Marcus', 'Kate Elder', 'Mattie Blaylock', 'Nellie Cashman',
  'Lotta Crabtree', 'Crawley Dake', 'Ike Clanton', 'Billy Clanton', 'Frank Stilwell', 'Pete Spence', 'John Behan', 'Wyatt Earp',
  // Note: frontier and border figures of the wider West.
  'Daniel Boone', 'Kit Carson', 'Davy Crockett', 'Jim Bowie', 'Sam Houston', 'Sam Bass', 'Tom Horn', 'Bob Ford', 'Robert Ford',
  'Clay Allison', 'Bass Reeves', 'Nat Love', 'Isom Dart', 'Mary Fields', 'Cathay Williams', 'Britton Johnson', 'Henry Flipper',
  'Bill Pickett', 'Pearl Hart', 'Calamity Jane', 'Belle Starr', 'Etta Place', 'Laura Bullion', 'Black Bart', 'Heck Thomas', 'Chris Madsen',
  'Charles Goodnight', 'Oliver Loving', 'Roy Bean', 'Tom Jeffords', 'Mickey Free', 'George Crook', 'Nelson Miles', 'Lew Wallace',
  'Tom Smith', 'King Fisher', 'Jack McCall', 'Harvey Logan', 'Kid Curry', 'Butch Cassidy', 'Robert Parker', 'Jim Bridger', 'Hugh Glass',
  'Joseph Walker', 'John Colter', 'John Sutter', 'Zebulon Pike', 'Isaac Parker', 'Joseph McCoy', 'Emmett Crawford', 'Orlando Willcox',
  'Frederick Benteen', 'Ira Hayes', 'Pancho Villa', 'Porfirio Díaz', 'Tiburcio Vásquez', 'Gregorio Cortez', 'Juan Cortina', 'Elfego Baca',
  'Mariano Vallejo', 'Juan Seguín', 'Joaquín Murrieta', 'Emiliano Zapata', 'César Chávez', 'Lázaro Cárdenas', 'Juan Álvarez',
  'Samuel Colt', 'Oliver Winchester', 'Sarah Winchester', 'Henry Wells', 'Jay Gould', 'Elias Howe', 'Eli Whitney', 'Robert Fulton',
  // Note: statesmen, soldiers and writers a player would know at once.
  'George Washington', 'Abraham Lincoln', 'Andrew Jackson', 'James Monroe', 'John Tyler', 'Franklin Pierce', 'Ulysses Grant',
  'Jefferson Davis', 'Robert Lee', 'Winfield Scott', 'Nathan Forrest', 'George Pickett', 'John Mosby', 'Nathan Hale', 'Israel Putnam',
  'Benjamin Franklin', 'Daniel Webster', 'Stephen Douglas', 'Edwin Stanton', 'Elizabeth Stanton', 'Clara Barton', 'Rosa Parks', 'Betsy Ross',
  'Henry Wilson', 'Warren Harding', 'Herbert Hoover', 'William Taft', 'James Carter', 'Levi Morton', 'Hannibal Hamlin', 'Samuel Chase',
  'Elijah Lovejoy', 'Thaddeus Lowe', 'Oliver Perry', 'Thomas Gage', 'Edmund Randolph', 'George Mason', 'Walter Reed', 'Stephen Foster',
  'Hiram Bingham', 'George Carver', 'George Eastman', 'Booker Washington', 'Frederick Douglass', 'Edward Bellamy', 'Edward Curtis',
  'Orville Wright', 'Wilbur Wright', 'Oscar Wilde', 'Thomas Paine', 'Thomas Hardy', 'Cyrus Vance', 'Daniel O\'Connell', 'Dennis Kearney',
  'Myles Keogh', 'John Sullivan', 'Michael Collins', 'Hans Andersen', 'Jenny Lind', 'Leif Erikson', 'Astrid Lindgren', 'Ingrid Bergman',
  'Rudolf Hess', 'Max Weber', 'Otto Frank', 'Helmut Kohl', 'Gerhard Schroeder', 'Hans Zimmer', 'Diego Rivera', 'Vicente Fernández',
  'Felipe Calderón', 'Agustín Lara', 'Carlos Fuentes', 'Charlie Chan',
  // Note: famous people of the screen and of western fiction, so no hand reads as one.
  'John Wayne', 'James Garner', 'Pearl Bailey', 'Mae West', 'Taylor Swift', 'Anthony Quinn', 'Walter Brennan', 'Ward Bond', 'Cole Porter',
  'Eli Manning', 'Tom Sawyer', 'Thomas Sawyer', 'Ichabod Crane', 'Daisy Miller', 'Laura Palmer', 'Josephine March', 'Walter White',
  'Arthur Morgan', 'John Marston', 'Micah Bell', 'Abigail Roberts', 'Hosea Matthews', 'Josiah Trelawny', 'Kieran Duffy',
  'Eugene O\'Neill', 'Joseph McCarthy', 'Thomas Moore', 'Henry Hill', 'John Knox', 'John Locke', 'John Edwards', 'Elihu Root',
  'Horatio Seymour', 'Cecil Rhodes', 'Sterling Price', 'Spencer Tracy', 'Floyd Patterson', 'Austin Powers', 'Burl Ives', 'Preston Brooks',
  'Richard Kimball', 'Edmund Burke', 'Francis Fitzgerald', 'James Connolly', 'Ignatius Donnelly', 'Maureen O\'Hara', 'Matthew Dillon',
  'Adam Cartwright', 'Ben Cartwright', 'Fritz Lang', 'Otto Hahn', 'Karl Kraus', 'Klaus Fuchs', 'Hans Krebs', 'Hans Geiger', 'Hans Gruber',
  'Philip Roth', 'Gerhard Richter', 'Paul Ehrlich', 'Martha Graham', 'Gertrude Stein', 'Sophie Scholl', 'Jane Wyman', 'Lois Lane',
  'Dorothy Gale', 'Dorothy Day', 'Ethel Waters', 'Phoebe Snow', 'Sadie Hawkins', 'Augusta Savage', 'Julia Child', 'Jane Pittman',
  'Mary Terrell', 'Silas Hocking', 'Diego Luna', 'Jorge Ramos', 'Juan Ponce', 'Jimmy Lai', 'Tommy Chong', 'Arne Jacobsen',
  'Charles Lindbergh', 'Florence Henderson', 'Laura Keene', 'Frances Burnett', 'Kate Warne', 'Cy Tolliver', 'Johnny Cash', 'John Cash',
  'Lester Young', 'Earl Campbell',
];

// Note: the weight of each cultural group in a use of the catalogue; a use is who the name is for, and a weight of zero leaves the group out.
export const USE = {
  any: [['anglo', 39], ['irish', 11], ['german', 10], ['nordic', 4], ['cornish', 5], ['hispano', 17], ['black', 6], ['chinese', 4], ['native', 4]],
  sheriff: [['anglo', 62], ['irish', 12], ['german', 10], ['nordic', 4], ['cornish', 4], ['hispano', 8]],
  deputy: [['anglo', 47], ['irish', 12], ['german', 10], ['nordic', 4], ['cornish', 5], ['hispano', 18], ['black', 4]],
  hire: [['anglo', 35], ['irish', 10], ['german', 9], ['nordic', 5], ['cornish', 5], ['hispano', 18], ['black', 6], ['native', 7], ['chinese', 5]],
  target: [['anglo', 45], ['irish', 12], ['german', 9], ['nordic', 4], ['cornish', 3], ['hispano', 22], ['black', 5]],
};

export const GROUPS = {
  anglo: {
    label: 'Anglo-American',
    m: w(`Abner Absalom Adam Albert Alden Alfred Alonzo Alvin Amos Andrew Ansel Archibald Asa Augustus Barnabas Benjamin Bertram Boyd Caleb
      Calvin Cassius Chauncey Chester Clarence Clay Clement Clifton Cornelius Cyrus Daniel Darius David Delbert Dell Dexter Eben Edgar Edmund
      Edwin Eli Elias Elijah Elmer Emmett Enoch Ephraim Erastus Ethan Eugene Ezra Felix Ferris Fletcher Francis Franklin Gideon Gilbert
      Hamilton Harlan Harvey Henry Hiram Hollis Horace Hosea Howard Hugh Ira Isaac Israel Jacob James Jared Jasper Jedediah Jeremiah Jesse
      Joel John Jonas Jonathan Joseph Josiah Judson Julius Lafayette Lemuel Leonard Levi Lewis Linus Lloyd Lucius Luther Lyman Marcus Martin
      Mason Matthew Micah Milton Nathan Nathaniel Ned Nehemiah Noah Norman Oliver Orrin Orville Oscar Otis Owen Phineas Quincy Ralph Randolph
      Reuben Rufus Russell Samuel Seth Silas Simeon Solomon Stephen Thaddeus Theodore Thomas Tobias Truman Ulysses Vernon Wallace Walter
      Warren Wesley Wilbur William Winfield
      Aaron Alpheus Ambrose Anderson Archer Arthur Asahel Austin Azariah Barney Basil Benajah Benedict Bennett Bert Burton Byron
      Cephas Clyde Columbus Curtis Dewitt Dorsey Duncan Earl Edson Elbert Eldon Elihu Elisha Ellis Elwood Emery Emory Erasmus Ernest Everett
      Festus Floyd Forrest Gaius George Gilson Granville Green Gus Hampton Harmon Harrison Hayden Hector Herbert Hezekiah Hobart Homer Horatio
      Hubert Irvin Isham Jackson Jonah Josephus Lamar Leander Lester Lonnie Loren Lowell Lucian Luke Lysander Mack Manley Merritt Milo Mordecai
      Murray Myron Napoleon Newton Obadiah Oran Orlando Orson Osborne Othniel Peyton Philander Philip Pliny Prentice Preston Randall Raymond
      Richard Riley Robert Rollin Roscoe Roswell Royal Rupert Sampson Sanford Seymour Sherman Sidney Spencer Squire Stanley Sterling Sumner
      Sylvanus Thornton Thurston Tillman Travis Ulric Virgil Wade Waldo Warner Watson Webster Weldon Wendell Whitman Wiley Willard Willis
      Wilmer Winston Zadok`),
    f: w(`Abigail Ada Adelaide Agnes Alma Amelia Anna Augusta Bertha Beulah Caroline Celia Charlotte Clara Cora Delia Dora Edith Eliza Ella
      Emma Esther Etta Eunice Fannie Flora Georgiana Hannah Harriet Hattie Ida Jane Josephine Julia Kate Laura Lavinia Lillian Louisa Lucinda
      Lydia Mabel Maggie Martha Mary Matilda Minnie Nancy Nellie Olive Pearl Phoebe Rachel Rebecca Rosa Ruth Sadie Sarah Susanna Theodosia
      Viola Winifred
      Addie Alice Allie Almira Alta Amanda Angeline Annie Arabella Aurelia Belle Bessie Betsy Blanche Callie Carrie Cassandra Catherine
      Cecilia Charity Chloe Clarissa Constance Cordelia Daisy Delilah Dorcas Dorothy Drusilla Effie Elizabeth Ellen Elmira Elsie Elvira
      Emeline Emily Estella Ethel Eudora Eva Evangeline Florence Frances Gertrude Grace Gussie Hope Imogene Irene Isabel Jemima Jennie
      Jessie Josie Katherine Keziah Lila Lizzie Lois Lorena Lottie Lula Luella Mae Malinda Marietta Marilla Maude Melinda Melissa Mercy
      Millie Mollie Myra Myrtle Nettie Octavia Ophelia Orpha Patience Permelia Polly Priscilla Prudence Rhoda Roxanna Samantha Selina
      Serena Sophronia Stella Susan Tabitha Temperance Tillie Verna Victoria Virginia Zilpha`),
    last: w(`Abbott Adair Alford Ames Ashby Atwood Ballard Barlow Barrett Beckett Bellamy Bidwell Blackburn Blevins Bowen
      Bradshaw Brewer Briggs Burgess Burroughs Calloway Chandler Chilton Cobb Colby Cotter Coyle Crandall
      Crowley Culver Dalrymple Danforth Dawson Dillard Dudley Dunmore Durham Edgerton Elkins Everett Fairchild Farley Fenn Finch Fisk
      Fleming Forbes Gaither Gantt Garrity Gentry Gibbons Gillis Goodwin Granger Gunter Hadley Hammond Hargrove Harlow Hatcher
      Hollister Hubbard Hurley Hutchins Ingram Ives Jarvis Jennings Jessup Kendrick Kincaid Kirby Lacey Langley Lathrop Lawson
      Ledbetter Lockhart Lowry Lyle Maddox Mallory Maxwell Mercer Merrill Mills Mitchell Nash Nesbitt Newcomb Oakes Orr Osgood Page
      Penn Pennington Pike Prescott Pritchard Pruitt Quarles Quill Radford Raymond Redmond Rhodes Ridley Rudd Rutledge Sanborn
      Selby Sharp Shelton Sloan Talbot Tate Thatcher Tucker Underhill Upshaw Vickers Waldron Walters Warrick
      Whitaker Whitlock Wickes Wilkes Winslow Yarborough Yates
      Acker Allard Amberson Applegate Arnold Ashford Atkins Avery Babcock Banks Barber Barker Barnes Baxter Beale Beecham Blair Blake
      Bliss Bowles Boyce Bradford Bramwell Brandon Bratton Bristow Brock Buckley Bullard Bundy Burch Byers Caldwell Camden
      Cannon Carey Carlisle Carney Carr Castle Chaffee Cheney Church Clayton Coburn Cochran Coffey Colburn Collier
      Combs Compton Conley Cooley Corey Cowan Cox Craig Crosby Cross Cummings Cushing Dale Darby Davenport Decker Denton Dickerson
      Dixon Dodd Downing Drake Draper Drummond Dunbar Dyer Easley Eaton Ellison Ellsworth English Ewing Fairbanks Faulkner
      Fenwick Ferguson Flint Fogg Foley Fowler Frazier Fuller Gardner Garland Gilmore Godwin Gooding Grady Graves Greer
      Griffin Grimes Grover Guthrie Hacker Halsey Harmon Harper Harrell Harrington Hastings Hawley Haynes Hazard Heath
      Henley Hicks Higgins Hinton Hitchcock Hobbs Hodge Holbrook Holden Holt Hopkins Horton Houghton Howland Hull Hunter
      Hyde Irwin Jeffries Jewell Judd Kellogg Kemp Kent Kerr Keyes Kingsley Knapp Knight Lamb Lambert Larkin Latham Leach
      Lester Lindsey Little Long Lord Lucas Lynn Mann Mayfield Mayhew McAllister McBride McDowell McKay McKenzie McLean McNeil
      Merritt Middleton Moody Morrow Moss Munson Murray Nichols Norris Norton Nye Ogden Osborne Perkins Phelps
      Platt Pope Potter Proctor Purdy Ramsey Rankin Ray Reese Rice Rich Richards Riggs Riley Robbins Rollins
      Rowland Royce Rush Sampson Sanders Sargent Sayer Seaver Sewell Shepherd Sherwood Simmons Skinner Slade Slater Small
      Somers Sparks Spooner Sprague Stafford Stark Starling Stearns Stoddard Stout Stratton Strong Sumner Swain Tanner Temple
      Terry Thayer Thorne Thornton Tillman Towne Townsend Trask Tuttle Upton Vail Vaughn Wakefield Wall Walton Ware
      Watkins Weaver Webb Weeks Welch Weller Wendell Wilcox Winters Wolcott Woodward Wylie York `),
  },
  irish: {
    label: 'Irish-American',
    m: w(`Bartholomew Brendan Brian Cornelius Daniel Dennis Eugene Hugh Lawrence Malachi Michael Owen Patrick Peter Roderick Terence Thaddeus
      Thomas Timothy Desmond Fergus Kieran Ronan Declan
      Andrew Bernard Christopher Darby Dermot Dominic Edward Felix Finbar Gerald Hubert Jeremiah Joseph
      Lorcan Mark Martin Matthew Maurice Myles Neil Oliver Philip Richard Roger Sylvester Ulick Vincent William Aloysius Barry Colman
      Laurence Luke Mortimer Niall Redmond Fintan Jarlath Kilian Columba Austin Bryan Cyril Emmet`),
    f: w(`Bridget Catherine Delia Eileen Ellen Honora Margaret Mary Nora Norah Sheila Winifred Maureen Kathleen
      Agnes Alice Anne Annie Brigid Cecilia Clare Dymphna Elizabeth Esther Fanny Hannah Helen Johanna Josephine Julia Kate Kitty Letitia
      Lizzie Nancy Nellie Peggy Rose Rosanna Sarah Teresa Una Abbie Bridie Ita Mairead Nuala Philomena Roisin Sinead Ursula Veronica Eliza
      Ellie Theresa Monica`),
    last: w(`Brennan Burke Byrne Callahan Carroll Coughlin Daly Delaney Devlin Doherty Donnelly Doyle Fahey Finnegan Fitzgerald
      Flanagan Gallagher Hanlon Hegarty Keegan Kelleher Kenny Lynch Madigan Maguire McGrath Moran Moriarty Mulligan Murphy Nolan
      O'Brien Quinn Rafferty Riordan Sheehan Sweeney Tierney Toomey Rooney Kavanagh Dunne
      Ahern Boland Boyle Breen Broderick Cahill Clancy Cleary Coakley Conlon Connolly Conroy Conway Corcoran Costello Cullen Cunningham
      Curran Cusack Dempsey Donovan Dowd Driscoll Duggan Egan Farrell Feeney Finn Flaherty Flynn Gaffney Galvin Geary Gilligan
      Glennon Hagerty Halloran Hannigan Hennessy Hogan Horgan Keane Keating Kehoe Kiernan Lally Lenihan Loughlin Lyons MacNamara Mahoney
      Malone Maloney McAuliffe McCabe McCann McCormack McDermott McDonagh McGee McGinnis McGuire McHugh McKenna McLaughlin McMahon McNally
      McNulty Mooney Moynihan Mulcahy Mullen Mulvaney Nagle O'Dwyer O'Keefe O'Leary O'Malley O'Reilly O'Rourke Phelan
      Power Quigley Regan Reilly Ryan Scanlon Shanahan Shea Tobin Walsh Whelan Barry Brophy Cronin Cosgrove Deasy Dolan Fennelly Garvey
      Grogan Hanrahan Heffernan Higgins Kirwan Lavelle Lonergan Mangan Meehan Mulrooney Noonan O'Callaghan O'Dea O'Grady Hurley Prendergast
      Roche Scully Slattery Tuohy Twomey Wall`),
  },
  german: {
    label: 'German-American',
    m: w(`Albrecht August Conrad Dietrich Emil Ernst Fritz Friedrich Gottlieb Gustav Hans Heinrich Hermann Jakob Johann Karl Konrad Ludwig
      Mathias Otto Rudolf Siegfried Wendel Wilhelm Anton Reinhold
      Adam Alois Andreas Arnold Balthasar Benedikt Bernhard Bruno Burkhard Christoph Clemens Dominik Eberhard Eduard Engelbert Erich
      Erwin Ferdinand Florian Franz Gebhard Georg Herbert Hubert Hugo Ignaz Joachim Josef Julius Kaspar Kurt Leopold Lorenz
      Lothar Lukas Magnus Markus Martin Meinrad Michael Moritz Nikolaus Oskar Oswald Ottmar Paul Peter Philipp Raimund Reinhard Rupert
      Sebastian Sigmund Simon Theodor Tobias Ulrich Urban Valentin Veit Viktor Walther Werner Wolfgang Xaver Leonhard Matthäus`),
    f: w(`Anna Berta Elsa Frieda Gertrud Greta Hedwig Helene Ilse Johanna Katarina Liesl Magdalena Margarethe Rosina Sophie Ursula
      Adelheid Agathe Agnes Amalie Antonie Barbara Charlotte Christine Dorothea Elisabeth Emilie Emma Erna Franziska Friederike Gisela
      Hanna Henriette Hildegard Ida Irma Josefine Juliane Karoline Klara Kunigunde Lina Louise Luise Maria Marianne Martha Mathilde Minna
      Ottilie Paula Pauline Regina Rosa Sabine Susanne Thekla Therese Theresia Veronika Walburga Wilhelmine Babette Lisette Monika Cäcilie`),
    last: w(`Ackermann Bauer Baumann Becker Berger Brandt Dietz Eberhardt Engel Fischer Franke Fuchs Gerber Haas Hartmann Hoffman Huber
      Jaeger Keller Kessler Klein Koch Kroeger Lehmann Lindner Maier Metzger Mueller Neumann Pfeiffer Reinhardt Richter Rosenthal
      Schaefer Schmitt Schreiber Schroeder Schultz Sommer Vogel Voss Wagner Weber Weiss Winkler Wolff Zeller Zimmerman
      Abendroth Adler Albrecht Arndt Bachmann Baer Beck Behrens Beyer Bischoff Blum Bock Boehm Brauer Brenner Buchholz Dorn Drescher
      Eckert Eichler Engelhardt Faber Feldmann Fink Frey Fritsch Gebhardt Glaser Goetz Graf Gross Guenther
      Hammer Hauser Heller Herrmann Hirsch Hofmann Jung Kaiser Kemper Kirchner Klemm Kluge Koenig Kramer Kuhn Kunz Lange Lorenz Meier
      Meyer Mohr Moser Nagel Ott Pohl Probst Rau Reuter Sauer Schaller Scharf Schneider Schulze Schwab Schwarz Seidel Seiler
      Steiger Stoltz Thiel Unger Vetter Vogt Walther Weigel Wendt Wiegand Wirth Ziegler Zinn Amsel Bader Brinkmann Dressler Eisele
      Fiedler Gaertner Hager Hecht Imhoff Lutz Morgenstern Nussbaum Oberle Pfister Rieger Schenk Spengler Stumpf Trautmann Uhl
      Wankel Wolter`),
    alias: ['Dutch'],
  },
  nordic: {
    label: 'Scandinavian',
    m: w(`Anders Arne Arvid Axel Bengt Birger Björn Carl Christian Einar Elof Emil Erik Erland Eskil Fredrik Gunnar Gustaf Håkon Halvor
      Harald Helge Hjalmar Ivar Jens Johan Jonas Karl Knut Lars Magnus Mats Mikkel Nils Olaf Ole Oskar Otto Peder Per Ragnar Rasmus Rolf
      Sigurd Sten Svend Sven Thor Torvald Ulf Valdemar Viggo Vilhelm Aksel Anton Asmund Bernt Edvard Eilert Eyvind Gudmund Halfdan
      Ingvald Iver Jakob Kjell Lauritz Mons Nikolai Severin Sivert Teodor Tollef Truls Amund Arnt Ingvar`),
    f: w(`Agnes Anna Astrid Birgit Brita Cecilia Dagny Ebba Elin Elsa Emma Gerda Gunhild Gudrun Hanna Hedda Helga Hilda Ida Inga Ingeborg
      Johanna Karin Kirsten Kristina Lena Magda Margit Marit Matilda Mette Ragnhild Sigrid Signe Solveig Stina Synnøve Thora Tove Ulla
      Valborg Augusta Beret Gjertrud Oline Petra Randi Sofie Maren`),
    last: w(`Aasen Anderson Arnesen Berg Bergstrom Bjork Blom Brekke Dahl Dahlberg Ekberg Eklund Engstrom Fjeld Fredriksen Grönlund
      Gunderson Hagen Halvorsen Hansen Haugen Hedlund Holm Holmberg Hovland Isaksen Jensen Johansen Karlsson Knutsen Kvale Larsen
      Lindqvist Lund Lundgren Lundquist Magnusson Moe Mortensen Nilsen Nordin Nyberg Nygaard Olsen Olson Pedersen Petersen
      Rasmussen Rud Sandvik Sjoberg Skog Solberg Sorensen Strand Strom Sundberg Svensson Thorsen Tollefsen Ulvestad Vik Wahl Westberg
      Wikström Aune Bakke Dalen Eide Fosse Gjerde Hauge Lien Myhre Nesheim Ostby Rønning Sether Tangen Tveit Vold Engebretsen Gulbrandsen
      Iversen Kristiansen Lauritzen Mikkelsen Paulsen Sivertsen Torkelsen Danielsen Edvardsen Gustafson Hedberg Hellstrom Lindahl Malmberg
      Norberg Sahlberg Swanson Thorson Hanson Carlson Lofgren Ostrom Rystad Haugland Skaar Hegge`),
    alias: ['Swede', 'the Swede', 'the Dane', 'Norway'],
  },
  cornish: {
    label: 'Cornish miner',
    m: w(`Hedley Jabez Jago Jethro Josiah Nicholas Richard Samuel Tristram Trevor Uriah William John Thomas Matthew Edmund Peter
      Absalom Arthur Benjamin Caleb Charles Digory Elias Elisha Francis George Hannibal Henry Humphry Isaac James Jonathan Joseph Lewis
      Moses Nathaniel Obadiah Petherick Philip Ralph Reuben Robert Stephen Walter Zacharias Zebedee Ezekiel Simon`),
    f: w(`Loveday Jenifer Tamsin Elizabeth Grace Mary Philippa
      Ann Bessie Charity Ellen Emily Eliza Harriet Jane Jenny Kezia Lavinia Louisa Morwenna Nancy Patience Prudence Sarah Selina Thomasina
      Wilmot Honour Blanche Avis Ebbet`),
    last: w(`Angove Bolitho Carne Chegwidden Dunstan Eddy Jago Jory Kitto Nancarrow Opie Pascoe Penhale Penrose Pengelly
      Polkinghorne Rowe Retallack Rosewarne Tregenza Trevenna Treloar Tremayne Trenear Trewin Vivian Pendarves Trethewey Nankivell
      Penberthy Curnow Bray Hosking
      Annear Bawden Berryman Bennetts Blamey Bosanko Carlyon Chenoweth Clemo Coad Couch Eustice Glasson Gribble Grose Hambly Hendy Hoskin
      Keast Lanyon Laity Lobb Mably Martyn Minear Moyle Nance Nankervis Odgers Oates Paull Pearce Penhaligon Pengilly Penna Pethick
      Polglase Prowse Rodda Roskilly Rule Sandry Skewes Spargo Symons Teague Tonkin Trebilcock Tregoning Tremewan Trengove Trerise
      Trewartha Trounson Uren Varcoe Vosper Wearne Yeo`),
    alias: ['Cousin Jack'],
  },
  hispano: {
    label: 'Hispano and Mexican',
    m: w(`Alejandro Andrés Antonio Agustín Bartolo Benito Bernardo Camilo Carlos Cipriano Cristóbal Diego Domingo Eduardo Eladio Emilio
      Esteban Eusebio Fabián Federico Felipe Fernando Francisco Gabriel Gregorio Guillermo Hilario Ignacio Isidro Jacobo Jesús Joaquín José
      Juan Julián Leandro Lorenzo Lucas Luis Manuel Marcos Mariano Mateo Miguel Nicolás Pablo Pedro Rafael Ramón Ricardo Rodolfo Rómulo
      Salvador Santiago Sebastián Tomás Valentín Vicente Víctor Anselmo Bonifacio Celestino Teodoro
      Abel Abelardo Adolfo Alberto Alfonso Alfredo Ambrosio Amado Apolonio Arcadio Aurelio Baltasar Bautista Bernabé Blas Casimiro Cayetano
      Cecilio Ciriaco Clemente Cornelio Crisanto Damián Demetrio Desiderio Dionisio Efraín Elías Emeterio Enrique Ernesto Estanislao Eugenio
      Evaristo Faustino Fermín Filiberto Florencio Fortunato Gaspar Genaro Gilberto Gumersindo Heriberto Hipólito Hermenegildo Higinio
      Honorato Inocencio Isaías Jacinto Jorge Juvenal Ladislao Leocadio Leonardo Liborio Lino Lucio Macario Marcelino Marcial Martín Matías
      Melquíades Modesto Narciso Nazario Nemesio Octaviano Pascual Patricio Plácido Policarpo Primitivo Próspero Quirino Raimundo Reyes
      Román Rosendo Rufino Saturnino Severiano Silvestre Simón Tadeo Teófilo Timoteo Toribio Trinidad Ubaldo Urbano Venancio Ventura
      Zacarías Zenón`),
    f: w(`Adela Altagracia Beatriz Carmen Catalina Concepción Dolores Elena Encarnación Esperanza Guadalupe Inés Josefa Juana Luz María
      Mercedes Paloma Refugio Rosario Socorro Teresa Teodora
      Adelaida Agapita Agustina Albina Amalia Ana Anita Antonia Apolonia Asunción Aurora Bárbara Benita Candelaria Casimira Cecilia
      Celestina Clara Consuelo Crescencia Cristina Delfina Dominga Eduviges Elisa Emilia Estefana Eufemia Eulalia Eusebia Felicitas
      Feliciana Filomena Francisca Gertrudis Gregoria Isabel Jesusa Leonor Leonarda Lorenza Lucía Luisa Manuela Margarita Marcelina Marta
      Matilde Micaela Natividad Nicolasa Pascuala Paula Petra Pilar Ramona Remedios Rosa Rufina Sabina Salomé Serafina Simona Soledad
      Susana Tomasa Úrsula Valentina Vicenta Ysidra Zenaida`),
    last: w(`Acosta Aguilar Alarcón Alvarado Archuleta Arias Armijo Baca Barela Bustamante Cabrera Camacho Cárdenas Carrillo
      Castañeda Chávez Delgado Durán Escalante Espinoza Figueroa Flores Galván García Garza Gonzales Gutiérrez Herrera
      Ibarra Jaramillo León Lucero Maldonado Martínez Mendoza Mesa Molina Montoya Morales Moreno Navarro Núñez Ochoa Olivas
      Ontiveros Ortega Ortiz Pacheco Padilla Peralta Quintana Ramírez Rangel Robles Rocha Rodríguez Romero Ruiz Salazar Sánchez
      Sandoval Serrano Sosa Tafoya Trujillo Urías Valdez Vargas Vega Zamora
      Abeyta Alcántara Almanza Amador Anaya Andrade Apodaca Aragón Arellano Atencio Ávila Barajas Barraza Benavides Bernal Borrego Bustos
      Cadena Campos Carbajal Carrasco Casados Castillo Chacón Cisneros Contreras Córdova Cota Crespín Domínguez Duarte Elizondo Encinas
      Esquibel Estrada Gallegos Gamboa Garibay Gil Godínez Gómez Granillo Guerra Gurulé Guzmán Hinojosa Jiménez Lerma Leyva
      Lobato López Lozano Luján Macías Maestas Manzanares Medina Meléndez Montaño Montes Mora Muñiz Murillo Nájera Nieto Olguín
      Olivares Orozco Otero Palacios Paredes Pérez Pino Portillo Quiroz Rascón Reyna Ríos Rivas Roybal Saavedra Salas Salcido
      Samaniego Santillanes Sedillo Segura Silva Solís Soto Suárez Tapia Téllez Terrazas Torres Tovar Trejo Ulibarri Varela Vásquez Velarde
      Velasco Venegas Vigil Villalobos Villanueva Yáñez Ybarra Zamudio Zúñiga`),
    alias: ['El Flaco', 'El Güero', 'El Viejo', 'Manco', 'El Pelón', 'El Gallo', 'El Tuerto', 'El Mocho', 'El Prieto', 'El Chivo', 'El Zurdo',
      'El Cojo', 'El Gordo', 'El Coyote', 'El Rubio', 'El Charro', 'El Ronco', 'El Mudo'],
    aliasF: ['La Güera', 'La Flaca', 'La Prieta', 'La Chata', 'La Morena'],
  },
  black: {
    label: 'Black American',
    m: w(`Abram Alfred Booker Cyrus Ezekiel Frederick Gabriel Isaiah Jerome Josiah Lewis Lucius Moses Nelson Obadiah Pleasant Rufus Samuel
      Sylvester Titus Wiley Zachariah Elijah Henry Jordan Marshall Thomas
      Aaron Abraham Absalom Alexander Allen Amos Anderson Andrew Augustus Benjamin Caesar Calvin Cato Charles Clement Daniel David Dempsey
      Edmund Emanuel Enoch Ephraim Floyd Gideon Green Hannibal Harrison Hiram Israel Jacob Jefferson Jesse Lafayette Lazarus Levi Marcus
      Matthew Milton Nathan Nathaniel Ned Noah Oliver Osborne Paul Peter Primus Prince Reuben Robert Sampson Simon Solomon Squire Stephen
      Washington Wesley Willis Ulysses Virgil Horace Mingo Spencer `),
    f: w(`Adeline Ada Dinah Easter Henrietta Hester Lettie Liza Mattie Narcissa Rosetta Sylvia Tempie Viney Eliza
      Alberta Amanda Amelia Angeline Annie Arabella Belle Bertha Caroline Carrie Celia Charity Clarissa Cora Delphine Dicey Ella Emeline
      Emma Esther Fannie Florence Hagar Harriet Hattie Ida Isabella Jane Josephine Julia Leah Lucinda Lucy Mahala Malinda Maria Martha Mary
      Minerva Nancy Patience Phyllis Priscilla Rachel Rebecca Rhoda Sallie Sophia Susan Tabitha Violet Zilpha`),
    last: w(`Bledsoe Bowman Branch Burrell Chambers Cheatham Coleman Dabney Dupree Fortune Freeman Gaines Garnett Hairston Holloway Lovett
      Merriweather Pettiford Pinkney Pryor Ransom Reddick Rucker Singleton Sneed Spruill Tolbert Truesdale Whitfield Wimbush Woodson Yancey
      Alston Ashe Banks Battle Beasley Berry Bivens Blount Boykin Brooks Bryant Butler Byrd Cannon Carr Cobb Copeland Council Dancy Daniels
      Dawkins Dorsey Drayton Elam Ellis Epps Exum Faison Gilliam Goode Gordon Graves Gregory Grimes Hargrove Hawkins Haywood Hightower
      Hilliard Hines Horne Hunter Jeter Jiles Keys Lacy Lattimore Leach Mabry Mack Majors McCray McGhee Means Moody Mosley Nash Overton
      Peebles Person Pettaway Pinkett Poindexter Pope Purvis Redmond Rountree Royster Saunders Scales Shields Spencer Spratley Staton
      Stokes Strother Tate Terry Thornton Toney Tyree Upshur Vick Waddell Walton Ware Watkins Weathers Whitlow Wilder Winston Wise Womack
      Wormley Wynn`),
  },
  chinese: {
    label: 'Chinese-American',
    m: w(`Chun Fai Fong Gim Hing Hong Jun Kee Kwan Lok Lung Ming Pak Sing Tai Wah Wing Yan Yun Cheung Hoi Kwok Sam Charlie Joe George
      Bing Cheong Chuck Chung Foon Hin Kam Keung Kim Kin Kit Kong Lai Lin Loy Mun Nam Pang Quong Sang Shing
      Sun Tim Tong Tuck Wai Yick Yip Frank Jimmy Tom Willie Ben Ah Jow Kai Leung Mon Poy Shew Ying`),
    // Note: the camps of the 1880s held very few Chinese women, so the group gives none and a woman is drawn from another.
    f: [],
    last: w(`Chin Chow Fong Hom Lau Lee Leong Lim Louie Mah Moy Ng Quan Seto Soo Tsang Wong Yee Yuen Eng Fung Ho Lum Tam Cheung Lui
      Mok Poon Sze Tang Woo Wu
      Au Chang Cheng Chiu Chu Chung Dea Goon Hing Hoy Hui Jue Kam Kan Kwok Lam Leung Li Liang
      Lin Ling Liu Lo Low Ma Mar Ong Pang Quock Shum Siu Sun Tom Tong Tse Wan Yick Yip Yow Yu Yung Gong Jan Kwong
      Ying`),
  },
  native: {
    label: 'Native American',
    // Note: period records of the Pima, Tohono O'odham and scouts show given names and surnames in plain English and Spanish form, so none is invented to sound exotic.
    m: w(`Antonio Charley Francisco Jim Joe José Juan Lewis Manuel Mose Pablo Sam Santiago Thomas Tom Miguel Peter Luis
      Albert Alfred Augustine Benito Carlos Charlie Edward Felipe Frank Harry Henry Hugh Ignacio Isaac Jesús Johnny Joseph
      Julian Lorenzo Lucas Marcos Martin Mateo Nicholas Pedro Rafael Ramón Simon Solomon Stephen Vicente William Daniel
      Frederick Matthew Paul Ralph Richard `),
    f: w(`Maria Juana Rosa Margaret Susan Anna Lucy Rosario
      Alice Annie Ella Emma Helen Isabel Josefa Julia Louisa Martha Mary Nellie Sarah Teresa Carmen Dolores Lola Elizabeth Jane Lena
      Nancy Rebecca Ruth Clara Ellen`),
    last: w(`Antone Enos Francisco Jose Juan Lewis Manuel Pablo Peters Thomas Nelson Stewart Wheeler Johnson Dickens Hendricks Lopez Ortega
      Andrew Antonio Augustine Carlos Encinas Ignacio Joaquin Martin Mendez Miguel Morago Narcia Norris Pedro Ramon Rios Santos Stevens
      Victor Williams Ortiz Lucas Preston Rhodes Vavages Sabori Siquieros Anton Escalante Harvier Narcho Kisto Lomas
      Felix Ahill Wellington Mattias `),
  },
};

// Note: nicknames fit for anyone; a group may add its own, but the general list is what a case's target draws from.
export const ALIASES = [
  'Rusty', 'Shorty', 'Tin Cup', 'the Deacon', 'Limpy', 'Slim', 'Whistler', 'Red', 'Spade', 'One-Eye', 'the Professor', 'Kid', 'Gopher',
  'Curly', 'Lefty', 'Tex', 'Judge', 'Preacher', 'Cap', 'Hoss', 'Ace', 'Cookie', 'Dusty', 'Smoky', 'Buck', 'Tiny', 'Stub', 'Sandy', 'Blackie',
  'Bronco', 'Sparrow', 'Pancake', 'Sunny', 'Lucky', 'Old Man', 'the Quiet One', 'Doc',
  'Bones', 'Brick', 'Bud', 'Bull', 'Cactus', 'Cayuse', 'Chalky', 'Chip', 'Cotton', 'Coyote', 'Crow', 'Fiddler', 'Flint', 'Frenchy', 'Gabby',
  'Grizzly', 'Hambone', 'Happy', 'Hawk', 'Jinx', 'Knuckles', 'Lanky', 'Mule', 'Mumbles', 'Nails', 'Nickel', 'Ox', 'Parson', 'Patches',
  'Pecos', 'Pinto', 'Pistol', 'Pockets', 'Possum', 'Prairie Dog', 'Rawhide', 'Rattler', 'Reb', 'Rooster', 'Sarge', 'Scratch', 'Shotgun',
  'Skeeter', 'Skinny', 'Sleepy', 'Snake', 'Snuffy', 'Sourdough', 'Spud', 'Squint', 'Stretch', 'Tater', 'Thumbs', 'Tumbleweed', 'Turkey',
  'Two-Bits', 'Weasel', 'Whiskey', 'Wolf', 'Yank', 'the Undertaker', 'the Hermit', 'the Colonel', 'the Major', 'the Captain', 'Bible',
  'Calico', 'Dixie', 'Hardtack', 'Jackrabbit', 'Muley', 'Pappy', 'Pinky', 'Rebel', 'Sidewinder', 'Six-Bits', 'Sonny', 'Spurs', 'Stumpy',
  'Ten-Spot', 'Wildcat', 'Wink', 'Badger', 'Biscuit', 'Boots', 'Mesquite', 'Sawbones', 'Tinhorn', 'Lonesome', 'Gravel', 'Rimrock',
];
// Note: nicknames a woman of the camps went by; a woman draws from these and her group's own, never from the men's.
export const ALIASES_F = [
  'Red', 'Sandy', 'Dusty', 'Lucky', 'Sunny', 'Sparrow', 'Slim', 'Curly', 'Lefty', 'Ace', 'Calico', 'Dixie', 'Duchess', 'Countess', 'Queenie',
  'Sis', 'Babe', 'Ma', 'Granny', 'Sugar', 'Kitty', 'Dolly', 'Goldie', 'Rosie', 'Missy', 'the Widow', 'Birdie', 'Peaches', 'Tex', 'Pinky',
  'Boots', 'Biscuit', 'Mesquite', 'Two-Bits', 'Six-Bits', 'Lonesome', 'Wildcat', 'Sonny', 'Doc', 'Cookie', 'Cactus', 'Jinx',
];

// Note: the names of each group joined, for tests and for anything that wants the whole book.
export const FIRST_NAMES = [...new Set(Object.values(GROUPS).flatMap((g) => [...g.m, ...g.f]))];
export const LAST_NAMES = [...new Set(Object.values(GROUPS).flatMap((g) => g.last))];

const FULL = new Set(FORBIDDEN_FULL.map((n) => n.toLowerCase()));
const lc = (s) => s.toLowerCase();

// Note: rejects pairs that read as a joke or as a real figure: the same word twice, one word inside the other, or a forbidden full name.
function okPair(first, last) {
  const f = lc(first);
  const l = lc(last);
  if (f === l || l.startsWith(f) || f.startsWith(l)) return false;
  return !FULL.has(`${f} ${l}`);
}

export const lastOf = (name) => String(name).trim().split(/\s+/).slice(1).join(' ');

// Note: rng is anything with next() or the function itself; opts: use (a key of USE), groups ([[id, weight]]), sex ('m' or 'f'), femaleChance, alias (true or a chance),
// Note: taken (a Set of lower-case full names that must not repeat) and avoidLast (a Set of lower-case surnames to avoid when an alternative exists).
export function makeName(rng, opts = {}) {
  const next = typeof rng === 'function' ? rng : () => rng.next();
  const pick = (a) => a[Math.floor(next() * a.length)];
  const sex = opts.sex || (opts.femaleChance && next() < opts.femaleChance ? 'f' : 'm');
  const table = (opts.groups || USE[opts.use || 'any']).filter(([g, wt]) => wt > 0 && GROUPS[g][sex].length);
  const total = table.reduce((s, [, wt]) => s + wt, 0);
  const group = () => {
    let r = next() * total;
    for (const [g, wt] of table) {
      r -= wt;
      if (r <= 0) return g;
    }
    return table[table.length - 1][0];
  };
  const free = (first, last, strict) => okPair(first, last)
    && !(opts.taken && opts.taken.has(lc(`${first} ${last}`)))
    && !(strict && opts.avoidLast && opts.avoidLast.has(lc(last)));
  let hit = null;
  for (let k = 0; k < 48 && !hit; k++) {
    const g = group();
    const first = pick(GROUPS[g][sex]);
    const last = pick(GROUPS[g].last);
    if (free(first, last, k < 32)) hit = { first, last, g };
  }
  // Note: a thin catalogue (a test that fills the book) falls back to a scan so a free pair is always found when one exists.
  for (const [g] of table) {
    for (let a = 0; a < GROUPS[g][sex].length && !hit; a++) {
      for (let b = 0; b < GROUPS[g].last.length && !hit; b++) if (free(GROUPS[g][sex][a], GROUPS[g].last[b], false)) hit = { first: GROUPS[g][sex][a], last: GROUPS[g].last[b], g };
    }
  }
  if (!hit) return null;
  let alias = null;
  const chance = opts.alias === true ? 1 : opts.alias || 0;
  if (chance > 0 && next() < chance) {
    // Note: half the nicknames of a group with its own (Dutch, Cousin Jack, El Flaco) come from that list, which is what makes them read as the group's.
    // Note: a woman takes her group's women's nicknames (La Güera) and the women's list, so she is never Cousin Jack or Old Man.
    const own = sex === 'f' ? GROUPS[hit.g].aliasF : GROUPS[hit.g].alias;
    const a = pick(own && next() < 0.5 ? own : sex === 'f' ? ALIASES_F : ALIASES);
    if (lc(a) !== lc(hit.first) && lc(a) !== lc(hit.last)) alias = a;
  }
  return { name: `${hit.first} ${hit.last}`, first: hit.first, last: hit.last, alias, group: hit.g, sex };
}

// Note: a stream from a string, so a name can come from the seed alone.
export const streamOf = (key) => makeRng(seedFromString(key));

// Note: the starting sheriff and deputy; drawn from the campaign seed only, so a game and its saves agree on them.
export function startNames(seed) {
  const s = String(seed);
  const sheriff = makeName(streamOf(`${s}:start:sheriff`), { use: 'sheriff' });
  let deputy = null;
  for (let k = 0; k < 24; k++) {
    deputy = makeName(streamOf(`${s}:start:deputy:${k}`), { use: 'deputy', taken: new Set([lc(sheriff.name)]), avoidLast: new Set([lc(sheriff.last)]) });
    if (deputy.last !== sheriff.last) break;
  }
  return { sheriff, deputy };
}

// Note: the words a character's name must never be; roles are titles, not names.
export const ROLE_WORDS = ['Sheriff', 'Deputy', 'Hand', 'Hire', 'Hired hand', 'Civilian', 'Hostile'];
