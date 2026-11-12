# Western Showdown

Spec version: v1.0.1

This is the single living specification for Western Showdown. A settled item has no possible alternatives, while an open item has alternatives awaiting a user decision. Implementation status is separate from decision status. Unresolved product choices and research dependencies belong in the decision boundary; implementation parameters are delegated to implementation and playtesting unless otherwise specified.

The specification was released as v1.0.0. Increment the patch for structure or style changes without content changes, the minor for compatible content changes, and the major for breaking content changes.

## Content

1. [SETTLED] Premise: Western Showdown is a real-time, top-down Western shooter. The player is a sheriff pursuing robbers, wanted men, and assassins across the Old West.

2. [SETTLED] Tone and consequences: The game aims for a super-realistic, hardcore experience with realistic physics, travel, loss, and risk. The exact simulation and consequences are specified in the items that follow.

3. [SETTLED] Setting: Use real town names and locations in the Old West, with the period and world boundary in items 28 and 234.

4. [SETTLED] Technology: Use Phaser 4 and custom tiles. Its architecture drew inspiration from the `road-game` engine.

5. [SETTLED] Generation direction: Room layouts and encounters are procedurally generated with difficulty and progression as inputs. House generation is specified in items 15, 57, 58, and 70; progression and generation are specified in items 145, 163, and 170–174.

7. [SETTLED] Objective: Complete the breach by taking down all hostiles in the house. Wounded and incapacitated hostiles are addressed in items 26 and 30.

8. [SETTLED] Deputy: The deputy initially follows the sheriff and engages threats under item 446.

9. [SETTLED] Presentation: Use top-down pixel graphics and no HUD during play. Preserve the established tactical visual style while increasing resolution and graphical detail. Portraits and vignettes follow the presentation requirements in item 312. Convey actionable information through the game world, including the focus effect in item 184.

10. [SETTLED] Input: Support keyboard and mouse. WASD moves; normal walking is the default. Shift toggles sprint and Ctrl toggles very slow, stealthy movement. Activating either mode selects it in place of the other; toggling the active mode again returns to normal walking. These modes do not require holding the modifier while moving.

11. [SETTLED] Standoff mechanics: Support leaning, crouching, and aiming as meaningful tactical mechanics. Exposure and injury risk should make positioning consequential.

12. [SETTLED] Wounds: Wounds are location-based. Some kill immediately, others kill gradually, and almost all wounds are fatal for the outcome of an encounter.

13. [SETTLED] Wounded combat and victory: The sheriff can continue fighting after a wound that kills gradually. Taking down all hostiles counts as a win even if the sheriff has sustained such a wound.

14. [SETTLED] Deputy victory: If the sheriff dies while hostiles remain, the deputy can continue fighting and win by taking down all remaining hostiles.

15. [SETTLED] House generation: Generate house layouts for breach encounters, subject to the case retry and persistence rules in items 156 and 160.

16. [SETTLED] House form: Generated breach houses resemble plausible Old West homes and may have one or more playable storeys, as appropriate to their location and circumstances. Their layouts and surroundings follow items 482–483.

17. [SETTLED] Floor visibility: Display the followed character's current floor, with portions of other floors revealed through a staircase only where direct line of sight permits. The stair traversal must not reveal other hidden rooms or grant vision from another character.

18. [SETTLED] Player line of sight: While following the sheriff, the player sees only what is within the sheriff's own line of sight. Walls and obstacles strictly block that visibility; the deputy's sight does not reveal areas to the player while the sheriff is followed. Other friendlies must independently perceive and neutralize threats beyond the followed character's view.

19. [SETTLED] View after sheriff's death: If the sheriff dies while the deputy is still fighting, the view follows the deputy and shows only the deputy's own line of sight, subject to the same obstruction rules. The deputy remains autonomous; the player observes rather than taking control.

20. [SETTLED] Deputy tactical choices: The autonomous deputy has a full range of tactical options, including continuing to clear the house, taking a cautious approach, retreating, and carrying the sheriff to safety.

21. [SETTLED] Retreat outcome: The deputy's retreat alone does not fail the breach; any remaining friendlies continue on their own and can still win. If the sheriff is carried to safety while hostiles remain, the breach is a failure.

22. [SETTLED] Carrying the sheriff: The deputy may choose to carry the sheriff under the conditions in item 419, including when the sheriff is still able to fight but failing or crippled. The sheriff may resist under item 64.

23. [SETTLED] Tactical inputs: Mouse movement controls aim direction; left mouse fires; holding right mouse aims carefully; C toggles crouching; holding Q or E leans left or right respectively.

24. [SETTLED] Loadout and switching: The sheriff and teammates can carry an authentic long gun and handgun or handguns and switch between them, subject to item 367. Switching weapons consumes real time, as do other actions.

25. [SETTLED] Shared wound rules: Hostiles are subject to the same severe location-based wound rules as the sheriff and deputy.

26. [SETTLED] Wounded hostiles: Whether a wounded hostile can continue to pose a threat depends on the location of the wound.

27. [SETTLED] Aim settling: Careful aim takes time to settle. Movement, sprinting, and wounds disrupt accuracy.

28. [SETTLED] Historical period: The game is anchored in the 1880s.

29. [SETTLED] Starting firearms: The starting rifle is the Winchester Model 1873 and the starting handgun is the Colt Model 1873 revolver.

30. [SETTLED] Incapacitated hostiles: An incapacitated hostile counts as taken down for the breach objective even if still alive.

31. [SETTLED] Friendly fire: Shots can accidentally hit the sheriff or deputy. Apply the same projectile collision and wound rules as for other characters.

32. [SETTLED] Starting position: The sheriff and any participating teammates begin outside the house and are free to choose an entry.

33. [SETTLED] Field of view: The sheriff's field of view faces the aim direction and has a sharp central zone, a dimmer mid zone, and short, dim flank zones as specified in item 72. Areas outside the whole field are visually concealed. Walls and obstacles also block visibility.

35. [SETTLED] Entry points: Doors and windows can both be used to enter the house.

36. [SETTLED] Civilian encounters: Breach encounters consist primarily of hostiles, with a small chance that a civilian is present. Frequency, behavior, and outcomes are addressed in items 38, 41, 60, and 79.

37. [SETTLED] Deputy communication: The player can communicate with the deputy using realistically possible voice or hand signals. Voice and hand-signal commands are Cover me, Hold here, Push, and Fall back as specified in item 294. These communications are advisory; the deputy retains freedom to act independently.

38. [SETTLED] Civilian death outcome: A civilian's death is recorded as a negative outcome but does not by itself fail the breach.

39. [SETTLED] Communication input: Use number keys for deputy communication, with the player choosing voice or hand signal as described in the implementation defaults.

40. [SETTLED] Communication feedback: Use speech bubbles for dialogue and a subtle, audible stylized pseudo-voice rather than naturalistic synthesized speech. Environmental audio communicates appropriate events. Speech bubbles do not expose dialogue from characters the player cannot see or hear; the no-HUD and line-of-sight rules still apply.

41. [SETTLED] Civilian behavior: A civilian reacts naturally to danger, including taking cover or fleeing in response to gunfire.

42. [SETTLED] Outcome screen: After the breach, show a brief outcome screen reporting success or failure and losses. The no-HUD requirement applies during play.

43. [SETTLED] Initial awareness: Hostiles start unaware of the lawmen and can be alerted by loud noises, except road ambushers under item 402.

44. [SETTLED] Civilian intelligence: The sheriff can know before entry that a civilian might be inside, as conveyed by the briefing in item 69.

46. [SETTLED] Hostile resolve: Ordinary breach hostiles do not surrender, except wanted targets under item 492 and associates under item 291. Ordinary accomplices do not surrender under item 492.

47. [SETTLED] Entry interactions: A door can be opened quietly or forced, and windows can be used for entry, subject to their physical state, including locked doors and bolted windows. Actions produce appropriate noise.

48. [SETTLED] Unseen areas: Areas outside the followed character's current line of sight go dark, including previously seen rooms.

49. [SETTLED] Aftermath: When neither lawman can continue fighting, the outcome screen may be delayed briefly to support the atmosphere.

50. [SETTLED] Hearing: Characters have directional hearing affected by walls, and both sides can investigate noises.

51. [SETTLED] Platform: The game targets desktop browsers.

52. [SETTLED] Projectile penetration: Projectiles can penetrate doors, walls, and other obstacles when their material and the shot's physical properties realistically allow it.

53. [SETTLED] First aid scope: First aid is unavailable during a breach.

54. [SETTLED] Scavenging: Characters can pick up weapons or ammunition from fallen characters.

55. [SETTLED] Stairs: Walking up or down stairs is a time-consuming, animated action, not an instantaneous floor change. Each stair flight connects a lower-floor endpoint P to a spatially displaced upper-floor endpoint Q, including in buildings with more than two storeys. Entering at P and walking up carries the player to Q; entering at Q and walking down carries the player to P. The player controls traversal directly, with no auto-walk. Actors can see and shoot up or down a staircase when a direct line of sight exists, subject to obstruction and projectile collision.

56. [SETTLED] Post-victory death: Taking down all hostiles is a win even if the sheriff subsequently dies from an existing wound; record the death as a loss.

57. [SETTLED] Difficulty: The baseline difficulty is hard.

58. [SETTLED] Hostile count: The number of hostiles varies between encounters and is unknown to the player before entry.

59. [SETTLED] Seed replay interface: The Quick Breach outcome screen displays the generation seed and offers a way to replay it. Seed replay is available only in Quick Breach under item 480.

60. [SETTLED] Civilian frequency: A civilian is present in approximately one in ten generated encounters.

62. [SETTLED] Communication method: The player chooses between voice and hand signals. Whether the deputy perceives and acts on the communication depends on the situation and NPC AI.

63. [SETTLED] Victory aftermath: Show the outcome shortly after the last hostile is taken down, without an extra wait for a bleed-out. When the outcome shows, settle any existing fatal wound as a death from that wound and record it under item 56. The exact delay is an implementation parameter.
Rejected: 63-r-1. Play-on to resolve: Continue play briefly after the last hostile is taken down if necessary to resolve an existing fatal wound before showing the outcome.

64. [SETTLED] Resisting a carry: The sheriff can resist being carried by the deputy while still able to act.

65. [SETTLED] Seed scope: The seed reproduces the house and enemy placement. It does not require the fight's random events to repeat.

66. [SETTLED] Hostile variation: Hostiles can vary in experience and behavior.

68. [SETTLED] Failure when no lawman can fight: If hostiles remain and no lawman remains able to fight because the sheriff is incapacitated or dead and the deputy is incapacitated, dead, or has withdrawn, the breach fails even if the hostiles subsequently die from their wounds.

69. [SETTLED] Briefing: A brief text screen before each attempt explains the controls and can report that a civilian may be present. It is informational, not a preparation phase.

70. [SETTLED] Generation validity: Generate each breach house as a connected layout with furnished rooms, doors and windows, and at least one usable ground-floor entry. Multi-storey houses have usable stair connections between their floors. All rooms and hostiles must be reachable through the house's usable entries and connections. Apply the same reachability and physical rules to other buildings; reject and regenerate invalid layouts. Vary hostile count and placement with the house; do not display the count before entry. A seed reproduces the house and enemy placements, not the subsequent combat.

71. [SETTLED] Locomotion and stance: Resolve movement against solid geometry; prevent walking through walls, furniture, or other characters. Sprint is faster and louder than walking; slow movement is quieter. Shift and Ctrl select toggled movement modes as specified in item 10. C toggles crouching, which reduces profile and movement speed; pressing C again ends crouching. Leaning offsets the exposed aiming position while keeping the body subject to cover and collision. Held lean controls stop when released. Use body language and animation to distinguish creeping, walking, and running.

72. [SETTLED] Vision: Compute an aim-directed field of view with a sharp, long central zone, a dimmer mid zone, and short, dim flank zones reaching about 100 degrees to each side of the facing direction. Opaque walls and obstacles block sight in every zone. Careful aim gradually narrows the central zone while the flanks remain dimly visible. NPCs, including hostiles and deputies, recognise targets in flank zones more slowly than in the central zone; the sheriff's player has no imposed recognition delay. Exact angles, ranges, brightness, and delay are tuning parameters. Reveal only the followed character's currently visible area, including other floors only through an unobstructed stair sightline as specified in item 17; previously seen areas outside sight are dark. Characters independently perceive enemies subject to their own sight, including across stairs. The followed deputy's facing determines visibility after the sheriff dies. Update the displayed floor as the followed character traverses the stairs. Visual concealment does not prevent sounds from being heard under the hearing rules.

73. [SETTLED] Hearing and investigation: Movement, entries, speech, gunfire, and other audible actions emit sound. Distance and intervening materials attenuate it; characters use the perceived direction to investigate and react. Starting hostiles are unaware except for road ambushers under item 402; loud sounds can alert them. Shouted commands can also be heard by hostiles; hand signals require the deputy to see them.

74. [SETTLED] Weapons and cover: Use the equipped firearms and carry limits in items 361–368. Use period-appropriate ammunition, firing and reload sequences, and limited ammunition; switching, cycling, and reloading take time. Shots travel and collide with characters and geometry; cover and penetration depend on the intervening material and shot. Movement, sprinting, and wounds disturb aim, while held careful aim settles over time. Fallen characters' compatible ammunition and weapons can be collected through a timed interaction.

75. [SETTLED] Wound effects: Resolve hits against body regions and apply effects appropriate to location and severity: potentially immediate death, bleeding and delayed death, impaired mobility or weapon handling, or incapacitation. Characters who remain capable can fight; incapacitated hostiles count as taken down. Wounds use the same rules for lawmen, hostiles, and civilians. No first aid is available during a breach.

76. [SETTLED] Entries and interactions: Permit quiet operation of unlocked doors and forceful entry when an obstruction requires it. Windows support entry subject to their state, including bolts. Entry, forcing, and climbing consume time and generate sound appropriate to the action. Do not permit an entry through an intact barrier without an action that makes it usable.

77. [SETTLED] Deputy conduct: The deputy independently observes, moves, takes cover, engages threats, and chooses when to retreat or carry the sheriff based on situational awareness, perceived danger, and the sheriff's condition, rather than carrying reflexively. The deputy maintains its own tactical zone map under items 412 and 414, retaining independent perception and judgment. Keep visual contact with the sheriff to receive hand signals whenever circumstances permit, and avoid obstructing the sheriff. The deputy may receive communications only through perceivable speech or signals, and may act independently. Avoid firing through a known ally; accidental friendly fire remains possible. After the sheriff dies, follow the autonomous deputy until the encounter resolves.

78. [SETTLED] Communication controls: Number keys select deputy communications; a separate input selects voice or hand signal, and subsequent communications use the selected method. Voice keys 1–4 select Cover me, Hold here, Push, and Fall back respectively, as specified in item 294. Hold here defends the nearest friendly zone under item 413. The same number-key mapping applies to hand signals. Show hand commands through character animation or another in-world visual mechanism. Where a command communicates a target, use the mouse position only where the selected method and current situation make that target reasonably communicable; Hold here does not designate a pointed area. Do not transmit information to the deputy that the sheriff has not perceived. The briefing explains the final key mapping.

79. [SETTLED] Encounter resolution: Win when every hostile is dead, incapacitated, or secured after surrender under items 291 and 492. Record subsequent sheriff death from an existing wound as a loss within that win; allow a brief aftermath when needed. Fail when no lawman remains able to fight while hostiles remain, or when the deputy carries the sheriff to safety while hostiles remain. A deputy's retreat alone does not fail the attempt. Civilian death is a negative outcome, not automatic failure. Present success or failure and relevant deaths and injuries on the outcome screen. Quick Breach additionally offers the seed and replay under item 59; campaign retries follow item 156.

80. [SETTLED] Breach acceptance: A desktop-browser build must allow an attempt from briefing through outcome and retry; produce valid houses with one or more storeys, replayable in Quick Breach; enforce sight and sound restrictions; support the specified controls and entries; and exercise victory, failure, wounds, civilian and deputy behavior. Verify these with reproducible gameplay scenarios, including line-of-sight obstruction, friendly fire, incapacitated-hostile victory, sheriff death with a surviving deputy, and seeded replay in Quick Breach only. Verify that campaign outcomes do not offer seed replay and that campaign retries preserve consequences. Choose practical browser compatibility and performance targets during implementation and document them.

81. [SETTLED] Western interface: Style the menu and interface to suit the Western setting. The game must not enter fullscreen mode.

82. [SETTLED] Action animation: Animate reloading, breaching, entering, and stair traversal. When the deputy carries the sheriff, visibly depict the sheriff being carried. Use animation or body language instead of action bubbles for states such as creeping, walking, or hand-signal-only communication; dialogue may use speech bubbles as specified in item 40.

83. [SETTLED] Revised acceptance checks: Verify both toggled movement modes and their return to normal, C toggling crouching on and off, distinct voice and hand-signal commands and their perception, audible pseudo-voice and dialogue bubbles, the absence of action-state bubbles, carrying and interaction animations, and sight and fire in both directions along stairs. Check that hostile and friendly hits use the same wound model; hostility alone must not make a character more resistant to equivalent hits.

84. [SETTLED] Impact reaction: Bullet impacts cause an appropriate physical and animated recoil or reaction based on the wound and its severity; a hit actor must not simply continue unaffected when the wound impairs action or movement. Do not flash actors red when hit.

85. [SETTLED] Cursor: Hide the crosshair cursor during play; mouse aiming remains available.

86. [SETTLED] Hostile reaction time: Hostiles require believable time to perceive an alert, orient, identify a target, and act. An unaware hostile must not instantly turn and fire in response to an alert.

87. [SETTLED] High aim: Holding right mouse while stationary activates high aim as part of careful aim, making deliberate headshots possible; settling still takes time and accuracy is affected by movement and wounds. Hostiles can receive critically lethal head wounds under the shared damage model.

88. [SETTLED] Arm injury and reload: Arm wounds affect weapon handling according to the affected arm and severity, including dropping a weapon or using the other hand where appropriate. A one-armed reload is significantly slower than an equivalent two-handed reload. The provisional model in item 95 is accepted as the baseline.

89. [SETTLED] Interaction conflicts: Looting a nearby body must not prevent the player from opening an intended door; interactions must resolve the intended reachable target consistently.

90. [SETTLED] Additional acceptance checks: Exercise player-controlled traversal from P to Q and back, cross-floor sight and firing, impact reactions and headshots for both sides, high aim, the four communications and deputy's independent situational awareness, one-armed reload timing, door interaction near loot, and continued play after a deputy retreats.

91. [SETTLED] Stair railings: Stair railings use thin, open banisters rather than full-tile solid blocks. Collision geometry must correspond to the visible railing and must not create invisible walls beside the stairs.

92. [SETTLED] Close-range lethality: Close range improves the probability of a well-placed hit, but death or incapacitation depends on the wound and the structures affected rather than an automatic close-range lethality bonus.
Rejected: 92-r-1. Close-range lethality bonus: Point-blank gunfire receives a high probability of immediate kill based on proximity itself.

93. [SETTLED] Deputy stealth judgment: The deputy observes and considers the sheriff's behavior before engaging. Spotting a hostile does not by itself require the deputy to fire immediately; the deputy can observe and preserve opportunities for stealth and scouting while responding to the situation independently.

94. [SETTLED] Gunplay acceptance checks: Verify movement around visible stair railings, close-range hit placement and location-based outcomes for both sides, and a stealth encounter in which the deputy observes a hostile without automatically firing. Verify hit reactions and wound consequences against the accepted model in items 92 and 96.

95. [SETTLED] Provisional arm-wound model: Treat the Winchester rifle as unusable when either arm is sufficiently impaired; allow the revolver to be used with the other usable hand with reduced accuracy. Arm hits can cause weapons to be dropped. The existing implementation uses a revolver reload time 2.5 times the ordinary time with one impaired arm; this is a tunable approximation, not a historically or medically established measurement.

96. [SETTLED] Hit-response evidence boundary: The implementation notes describe and test region-specific snap, stagger, flinch, and buckle reactions, but explicitly describe the overall wound and ballistic model as approximate and do not establish clinical probabilities. Use those reactions as game behavior, not as proof of real-world response or a basis for claiming medical accuracy.

97. [SETTLED] Progression direction: Advancement involves both completing cases and pursuing increasingly dangerous wanted people, and developing the sheriff's skills and equipment. The implementation defaults are specified in items 170 and 171.

98. [SETTLED] Cases and locations: Set the game in real places with fictional but realistic cases. Use period-appropriate sources for geography, settlements, transport, equipment, and daily life; do not present invented historical events or people as fact. Document source limitations and approximations. Research starting points include the Library of Congress's [1881 Tombstone mining district map](https://www.loc.gov/item/2012586611/) and the National Park Service's [Bisbee historic district documentation](https://npgallery.nps.gov/GetAsset/08f66c6f-a694-41f7-97e8-6807cfa8f48e/).

99. [SETTLED] Geographic scope: The wider game's free-roaming world encompasses the Old West as it existed in the 1880s. Places are gradually uncovered during play as specified in item 172.

100. [SETTLED] Travel presentation: Travel can use a stylized map. Encounters may occur during a journey as specified in item 173.

101. [SETTLED] Case availability: Cases appear occasionally, and the player can choose which to pursue. Case generation and lifecycle are specified in item 174.

102. [SETTLED] Persistent sheriff: The sheriff's skills, reputation, and injuries persist. The sheriff's death is permanent; succession is specified in items 107, 109, 180, and 181.

103. [SETTLED] Historical fidelity: The world must follow the geography and daily life of the 1880s Old West as closely as possible; item 98 specifies the historical implementation requirements.

105. [SETTLED] Hostile travel encounters: A hostile encounter during travel opens a playable tactical scene using the tactical mechanics. Item 173 adds non-hostile encounters resolved through map choices.

106. [SETTLED] Concurrent cases: Multiple cases can be available at once. Cases can expire or develop if ignored; item 174 specifies their timing and development; exact timings are implementation parameters.

107. [SETTLED] Campaign survival: A sheriff's death is permanent. The campaign can continue only if a deputy or another teammate survives; otherwise it ends. Items 180 and 181 specify how a survivor continues.

108. [SETTLED] Injury recovery: Wounds can heal over time and may leave lasting impairments. Healing and treatment follow items 173 and 175; lasting impairments use the wound effects in items 75 and 229. Exact healing rates are implementation parameters.

109. [SETTLED] Sheriff succession: After the sheriff dies, a surviving deputy may become sheriff or recruit one. The game decides between these outcomes using the criteria in item 180.

110. [SETTLED] Teammate recruitment and loss: The player can recruit additional teammates. Their injuries and deaths persist.

111. [SETTLED] World time: Time passes during travel and tactical scenes, allowing cases and the world to develop in the meantime.

115. [SETTLED] Reputation: Reputation applies to both individuals and the law-enforcement team and is global across the region. Item 170 specifies its progression effects.

116. [SETTLED] Case intelligence: The information available about a case, including its urgency and any deadline, reflects what could realistically be known. It can be incomplete or uncertain when circumstances warrant.

117. [SETTLED] Travel duration: Travel time depends on distance, terrain, weather, and available transport.

120. [SETTLED] Abandoning cases: The player can abandon an accepted case, and doing so can affect reputation. Items 170 and 174 define the consequences.

121. [SETTLED] Persistent resources: Money, supplies, and transport persist across the campaign. Item 175 specifies their acquisition, consumption, and loss.

123. [SETTLED] Horse and transport: The sheriff starts with a horse. Transport can be acquired, lost, and replaced; item 352 specifies its management.

124. [SETTLED] Resources: Track money, ammunition by caliber and size, and supplies such as food and water. Purchases require money; when the player has no money, nothing can be bought. Item 175 specifies consumption and shortage; exact rates and effects are implementation parameters.

125. [SETTLED] Case rewards and spending: Cases can pay rewards. Money can be spent on supplies, equipment, transport, and teammates; item 175 specifies payment; exact prices are implementation parameters.

126. [SETTLED] Travel selection: The player selects a learned destination and the journey advances toward it.

127. [SETTLED] Information during travel: Travel is not interrupted or redirected by newly arriving case information; information is usually obtained in towns. Hostile and other travel encounters can still occur as specified in items 105 and 173.

129. [SETTLED] Journey preparation: Before departure, the player can choose which teammates, supplies, and equipment to bring. The preparation controls and carrying constraints are implementation parameters, within items 164 and 175.

130. [SETTLED] Food and water shortages: Running out of food or water causes escalating consequences during a journey, potentially including death. Item 175 specifies the escalation; exact effects and timing are implementation parameters.

131. [SETTLED] Avoiding hostile encounters: The player can avoid or withdraw from a hostile travel encounter when circumstances permit. Item 173 specifies the conditions and consequences.

132. [SETTLED] Rest during travel: The team can stop to rest during a journey, consuming time and supplies. Items 136, 139, and 175 specify the benefits; the risks are the time, supplies, and travel encounters of item 173.

133. [SETTLED] Case payment: Payment depends on the case's terms and outcome; completing a case does not guarantee a fixed reward. In ordinary wanted-person cases, capture, death, and incapacitation of the target are equivalent for payment and reputation under item 493.

134. [SETTLED] Travel encounter generation: Travel encounters are procedurally generated.

135. [SETTLED] Teammate autonomy: Teammates can refuse a journey or leave the team based on factors including loyalty, reputation, and pay. Danger and the teammate's condition do not determine refusal or departure.

136. [SETTLED] Rest and treatment: Rest during travel helps ease fatigue. Medical treatment requires a doctor in town; wounds may still heal over time as specified in item 108.

137. [SETTLED] Teammates left behind: The sheriff can travel alone. Teammates not taken along stay in towns and do not act independently while left behind.

139. [SETTLED] Fatigue effects: Fatigue can affect movement, aim, and decision-making during encounters. Travel and combat can build fatigue, and rest reduces it. Exact rates and effects are implementation parameters.

140. [SETTLED] Redirecting travel: During a journey, the player can choose to turn back or change destination, subject to the learned-location rule in item 172.

141. [SETTLED] Loyalty: Teammate loyalty grows through solved cases and bonding through action. Its effects are specified in items 135, 180, 181, 230, 270, 323, and 350; exact progression is an implementation parameter.

142. [SETTLED] Learning of cases: The player learns of available cases through townspeople, contacts, and official notices rather than cases appearing automatically on the map. Sources refer to the shared cases in item 490 and disclose only information available to them.

143. [SETTLED] Doctor's care: Treatment in town costs money and takes time. Results depend on the injury and the care available.

144. [SETTLED] Town interface: Use a town menu for medical care, supplies, recruitment, and gathering information.

145. [SETTLED] Case generation: Cases are generated procedurally; the generation system may use authored material.

148. [SETTLED] Recruit types: The sheriff can recruit both deputies appointed to the sheriff's office and independent people hired for the work.

149. [SETTLED] Independent hire terms: Independent hires can join for a particular case or remain with the team until they leave.

150. [SETTLED] Appointed deputy terms: Appointed deputies are ongoing members of the sheriff's office. They can still leave the team under the conditions in item 135.

151. [SETTLED] Finding and recruiting teammates: Candidates become available through people and notices in towns. Their willingness to join depends on reputation and proposed pay.

152. [SETTLED] Teammate pay: Appointed deputies receive ongoing wages. Independent hires negotiate case-specific or ongoing payment terms according to their arrangement. Ongoing wages are paid on a schedule, including while a teammate is left in town.

153. [SETTLED] Skill improvement: Completed cases improve the skills of participants only. The game chooses and applies improvements automatically, without asking the player to allocate them; a surviving deputy retains that experience on becoming sheriff. Skills and their improvements are visible under item 463. Item 171 specifies the effects.
Rejected: 153-r-1. Player-directed allocation: Require the player to choose which skills receive improvements.

154. [SETTLED] Hostile encounter settings: Hostile encounters can take place outdoors as well as in generated buildings. Encounters support far aim as specified in item 186.

155. [SETTLED] Case outcomes: Cases cannot fail. They can be completed, abandoned, or expire. An encounter's failure does not by itself create a failed-case outcome.

156. [SETTLED] Encounter retries: If a case has not expired, surviving team members can return and retry after an unsuccessful encounter.

157. [SETTLED] Outdoor terrain: Generate outdoor encounter terrain and cover to reflect the real location and its surrounding landscape, subject to the regional, elevation, and approach requirements in items 484–486.

158. [SETTLED] Returning cases: An expired case can return later in a changed form, such as a target moving to another location.

159. [SETTLED] Active target location: A wanted person normally does not move between locations while their case is active. Reports of a target's location must not become outdated by the time the team arrives.

160. [SETTLED] Returning-case continuity: When an expired case returns, its earlier history, including prior attempts and consequences, carries forward.

162. [SETTLED] Case availability rate: The number of available cases remains roughly stable as the campaign progresses.

163. [SETTLED] Case progression: Harder and more rewarding cases emerge as the campaign progresses. Items 166 and 170 define the progression inputs and effects.

164. [SETTLED] Encounter team selection: The player chooses which recruited teammates join an encounter from those who traveled there, subject to the limit in item 319.

166. [SETTLED] Case progression inputs: Completed cases and reputation both influence the emergence of harder cases.

167. [SETTLED] Unpaid wages: A teammate can leave if the team cannot pay an ongoing wage.

168. [SETTLED] Distant cases: A town can offer cases elsewhere. Case information reveals destinations only when known through the pursuit under item 491.

169. [SETTLED] Retry team selection: Between attempts at the same case, the player can change the encounter team among teammates present, subject to the party-size limit.

170. [SETTLED] Campaign progression defaults: Track completed cases and the global individual and team reputations. Case completion updates reputation according to the outcome and terms; abandoning a case can reduce it. Use completed-case count and reputation to make more difficult, better-paying cases eligible while keeping the overall number of available cases roughly stable. Player skill or equipment does not automatically scale every encounter or make the entire world harder. Exact rates and thresholds are tuning parameters.

171. [SETTLED] Skill and equipment effects: Apply case-earned skill improvements to participants and show them under item 463. Skills influence the characters' existing tactical capabilities, while actual equipment and compatible ammunition determine available actions; neither creates a separate health pool or overrides the shared wound rules. Carry individual skills, reputation, injuries, and equipment forward through succession when the character survives. Exact skill categories and magnitudes are implementation and playtesting parameters unless specified by release requirements.

172. [SETTLED] Discovery defaults: Begin with the starting town known (item 301). Town information, case offers, leads, and progression can reveal additional places; accepting a distant case reveals a destination only if it is known from its available information. Show discovered destinations on the map and allow selection only after discovery. Do not reveal an undiscovered destination or its cases merely because it exists in the world data.

173. [SETTLED] Journey defaults: Advance world time according to the chosen route's distance, terrain, weather, and transport; update fatigue, supplies, wages, healing, and case timers as time passes. Allow rest, turning back, and redirection to learned locations. Generate hostile encounters that open tactical scenes and non-hostile encounters resolved through map choices. Resolve any avoidance or withdrawal through the circumstances and retain the applicable time, resource, injury, and death consequences. Exact travel rates and encounter probabilities are tuning parameters.

174. [SETTLED] Case lifecycle defaults: Generate cases in the shared world-wide pool under item 490 and present offers through people, contacts, and official notices in towns; do not surface them automatically as map markers. Track available, accepted, completed, abandoned, and expired cases. Multiple cases may be accepted; the world clock advances their applicable deadlines. Disclose terms and urgency only to the extent realistically known, keep active target-location reports valid through arrival, and allow retry of an unexpired case after an unsuccessful encounter. An expired case may return in changed form with its prior history and consequences intact. Completion awards any payment due under its terms and improves participants' skills, reported under item 463; abandonment can affect reputation. Cases do not have a failure outcome.

175. [SETTLED] Campaign resources: Track cash, compatible ammunition quantities, food, water, other carried supplies, equipment, and transport across towns and journeys. Purchases require sufficient money; record rewards and deduct purchases, agreed wages, and treatment costs. Consume appropriate supplies over elapsed travel and rest time and ammunition when used. Food or water shortages escalate and may be fatal; rest eases fatigue, and town doctors provide paid treatment over time. Exact prices, consumption rates, shortage effects, and stock levels are implementation and playtesting parameters.

177. [SETTLED] Campaign acceptance: Verify a new campaign starts as specified in item 301; town information can reveal and offer cases at destinations; unknown places cannot be selected; multiple cases can be accepted; and a destination-based journey advances time, consumes resources, and can produce both map-choice and hostile tactical encounters. Verify outdoor terrain, encounter-team selection and retry, case expiry and return with history, target-report validity, earned rewards, participant-only skill gains shown under item 463, global reputation, wages including absent teammates, treatment, fatigue, shortage consequences, persistent wounds and deaths, and continuation or campaign end under the succession rules. Use reproducible scenarios and document the historical sources and any deviations.

180. [SETTLED] Deputy succession: After the sheriff dies, the game uses surviving deputies' loyalty and skill to determine whether a deputy becomes sheriff or recruits a new sheriff. Exact thresholds and tie-breaking are implementation and playtesting parameters.

181. [SETTLED] Succession without a deputy: If teammates survive but no deputy does, the sheriff's office staffs a new sheriff and potentially new deputies when the survivors' loyalty is sufficiently good. If the survivors do not meet that condition, this succession path is unavailable and the campaign ends. The loyalty threshold and number of deputies are implementation and playtesting parameters.

182. [SETTLED] Peripheral vision acceptance: Verify that a person within a flank zone is visually dimmer than one in the central zone, and that an NPC recognises a flank target later than a comparable central target. Verify that nothing beyond the whole field or behind an opaque wall is visually revealed, that careful aim narrows the central zone without a sudden jump, and that hostiles and deputies use the same zones and NPC recognition rules.

183. [SETTLED] Focused aim: Being stationary, holding the aim direction steady, and crouching each contribute to gradual narrowing of the shot-accuracy corridor; crouching is not required for careful aim. Under favorable conditions accuracy can approach pinpoint precision without guaranteeing a hit: weapon characteristics, distance, cover, target movement, and wounds remain consequential. Movement, sharp turns, firing, and accuracy-affecting injuries disrupt or widen the corridor. The accuracy corridor is distinct from visual field-of-view narrowing, although both may settle gradually. Stationary right-click retains the deliberate head-aim behavior in item 87. Rates, limits, and interaction strengths are tuning parameters.

184. [SETTLED] Focus visualization: While careful aim is active, show the aiming corridor through a visual focus effect rather than a drawn corridor or HUD: blur the visible scene outside the focused area, which narrows or widens gradually with shot accuracy as specified in item 183. Outside careful aim, convey changes in accuracy through the sheriff's weapon and stance without applying this focus blur. The effect is distinct from the field of view and line of sight: it applies only to what is already visible and cannot reveal anything behind opaque obstacles or outside the visible field. Its visual style and blur strength are implementation parameters.
Rejected: 184-r-1. Always-on focus blur: Apply focus blur outside the aiming corridor regardless of whether careful aim is active.
Rejected: 184-r-2. Graded blur as the selected treatment: Use a continuous angular blur gradient as the defining approach rather than limiting the effect to careful aim. The selected treatment may still use soft edges as an implementation detail.
Rejected: 184-r-3. Body-language focus only: Convey focus through weapon sway, stance, and movement without applying scene blur even during careful aim.

185. [SETTLED] Focus visualization acceptance: Verify that during careful aim the focused area narrows as aim settles, widens when focus is disrupted, and blurs the visible scene outside it; verify that this focus blur is absent when careful aim is inactive. The scale must distinguish a settled prone rifle aim from a settled crouched one, reaching its narrow limit at the supported prone best case. Verify that the effect is distinct from the field of view and reveals no concealed areas or objects.

186. [SETTLED] Far aim: Provide a button that toggles a far-aim mode for the player-controlled sheriff in all encounters, outdoors and in buildings. While the sheriff is stationary, on their feet and not being carried, the mode extends sight in the aim direction and moves the view toward the pointer so the player can see and aim at more distant threats. Movement temporarily suspends the extended view; it resumes when the sheriff stops unless toggled off. The mode preserves obstruction and line-of-sight rules, does not reveal another character's sight, and does not change the existing fire and careful-aim controls. It has no effect while following a deputy. The key binding, range and camera movement are implementation and playtesting parameters. Verify toggling, movement and resumption, distant targeting, obstruction indoors and outdoors, and the camera's mapping of the pointer to the world.

187. [SETTLED] Cursor capture: Capture the mouse pointer in the browser during tactical play and use relative movement to control aim within the play area. Release capture for menus, pause and encounter outcomes; if capture is lost during play, clear held inputs and pause. Allow the player to capture the pointer by clicking the play area when browser gesture requirements prevent automatic capture. Verify aiming under capture, release and pause, and recapture on resuming or clicking the play area.

188. [SETTLED] Prone position: In every tactical encounter, allow the sheriff to toggle prone with X. Prone lowers body, eye and muzzle height and slows movement to a crawl. A stationary, carefully aimed prone shot becomes steadier than a crouched shot as aim settles and the direction is held; in the best conditions it is nearly pinpoint at far-aim distances. Movement, turning, recoil, wounds and weapon characteristics still affect accuracy. Projectiles, wounds and cover continue to use their shared physical rules. Solid low cover can conceal a prone person and obstruct a prone observer's view; windows remain transparent to sight in every stance while their sills can still obstruct low shots. Careful aim and stationary far aim remain available. Leaning and sprinting are unavailable while prone; pressing C ends prone and selects crouching. Door, window and scavenging actions require getting up, and prone cannot be entered during an action, while carried, carrying, or on stairs; entering stairs ends prone. Wounds and the normal weapon capability restrictions still apply. Show a distinct prone pose and crawling movement without a HUD. Exact dimensions, speed and transition timing are implementation and playtesting parameters. Verify stance transitions, movement, cover and projectile heights, aiming, action and wound interactions, and the rendered pose indoors and outdoors.

189. [SETTLED] Menu soundtrack: Play an original Western-themed instrumental soundtrack on menu screens, with a seamless or unobtrusive loop. Respect the shared sound setting and browser autoplay restrictions, starting after a user gesture if needed. Stop the soundtrack during tactical play and resume it on return to a menu. Verify mute, playback transitions, and graceful handling when audio is unavailable.

191. [SETTLED] Geographic extent: Cover the 1880s Old West in a broad map spanning multiple territories and states, with every settlement represented as specified in items 234 and 236.
Rejected: 191-r-1. Larger Southwest region: Expand beyond Cochise County into a substantial part of the Southwest rather than covering the entire Old West.
Rejected: 191-r-2. Existing region fully realized: Retain a smaller regional geographic boundary and focus on making its towns and surroundings explorable.

192. [SETTLED] Saloons: Town life includes saloons where the player can gamble and take part in other activities. Saloon fights occur occasionally, as specified in items 196 and 224–233.

193. [SETTLED] Traveling gunslingers: Traveling gunslingers looking for trouble appear in the world and, rarely, challenge someone to a duel. Items 207 and 219 specify the targets, items 343–348 and 214 the duel mechanics, and items 215–218 the consequences.

194. [SETTLED] Town navigation: The player chooses a destination from a town menu and can enter a playable saloon. Item 241 specifies the scope of other town locations.
Rejected: 194-r-1. Explorable streets: Traverse the town's streets in the top-down view to enter its locations.
Rejected: 194-r-2. Mostly menus: Resolve town activities mainly through menus and open a tactical scene only for a fight or duel.

195. [SETTLED] Gambling resolution: The player makes a simple gambling selection; time passes and the resulting wins or losses are shown. Item 245 specifies the selections, stakes, time, and outcomes.
Rejected: 195-r-1. Hand-by-hand play: Require the player to play out individual hands or rounds of a gambling game.

196. [SETTLED] Saloon fistfights: Fistfights can occasionally break out during saloon activities. Item 225 specifies the triggers and item 228 the resolution.

197. [SETTLED] Teammate saloon visits: While the crew rests in a town, any or all eligible teammates can independently choose to visit a saloon and may get into trouble there. If a teammate gets into a fight, the sheriff can intervene or stay out; the incident can cause losses to the crew and reduce loyalty. Teammate duel challenges follow items 200 and 202. Eligibility, notifications, and specific consequences are specified in items 246, 247, and 230.

198. [SETTLED] Saloon duel challenges: Gunslingers in saloons may rarely challenge a crew member to a duel. Items 207 and 219 specify the challenge, items 201, 202, and 217 the response, and items 215 and 216 the consequences.

199. [SETTLED] Fistfight intervention: When the sheriff intervenes in a saloon fistfight, the player enters the saloon scene and controls the sheriff in real time. The sheriff can instead stay out as specified in item 197. Items 224 and 226–227 specify the combat actions, item 228 the end conditions, and items 229–232 the consequences.
Rejected: 199-r-1. Choice-based intervention: Resolve intervention solely by choosing an option and receiving an outcome.
Rejected: 199-r-2. Optional choice-based resolution: Let the player choose between real-time intervention and a choice-based resolution.

200. [SETTLED] Teammate duel control: When a teammate fights a duel, the teammate acts autonomously and the player can only spectate. The player may skip ahead to the outcome, which is the same either way. Items 202 and 217 specify the challenge response, and item 215 the consequences.
Rejected: 200-r-2. Reported duel: Resolve the duel as an event and report its outcome afterward.
Rejected: 200-r-3. Player control: Let the player control the teammate for the duel.
Rejected: 200-r-4. Must watch: Require the player to watch the whole duel without skipping.

201. [SETTLED] Defusing a duel: Before the exchange begins, a duel can be stopped only by talking the opponent out of it. If the opponent remains persistent, the duel happens. Item 214 specifies how the exchange can end once shots have been fired.
Rejected: 201-r-1. Unconditional refusal: Allow the challenged person to decline and stop the duel without persuading the opponent.

202. [SETTLED] Duel persuasion: When the player-controlled sheriff is challenged, the player chooses what to say and the outcome depends on the situation and opponent. When a teammate is challenged, the teammate attempts persuasion autonomously. If persuasion fails and the teammate duels, the player spectates as specified in item 200.
Rejected: 202-r-1. Single persuasion action: Replace the sheriff's choice of what to say with one generic action whose outcome the game determines.
Rejected: 202-r-2. Player-directed teammate persuasion: Let the player choose what a challenged teammate says to the opponent.
Rejected: 202-r-3. Autonomous sheriff persuasion: Have the sheriff attempt persuasion without a player choice when challenged.

203. [SETTLED] Duel format: Duels use a quick-draw exchange: the opponents face each other, and the timing of the draw and shot matters. Items 343–348 specify the draw, aim, and firing; items 214 and 298 specify how the exchange ends.
Rejected: 203-r-1. Ordinary tactical encounter: Resolve the duel as an encounter based on the existing free movement, aiming, cover, and gunplay instead of a quick-draw exchange.

204. [SETTLED] Quick-draw control: The player chooses when to draw, then aims and fires the sheriff's weapon. The draw follows item 343, the aim items 344, 347 and 348, and firing item 345.
Rejected: 204-r-1. Timed button: Resolve the shot automatically after the player presses a button at the right moment.

205. [SETTLED] Quick-draw timing: In a duel, either opponent can draw at any time; there is no agreed signal to start. The player watches the opponent and chooses when to draw, aim, and fire. Judgment depends on the circumstances as specified in items 206 and 216. This is a game-design choice informed by research on informal Western gunfights, not a claim that a single set of rules governed them: see [Yale's interview with historian John Mack Faragher](https://news.yale.edu/2015/07/21/gunfights-us-colonialism-and-studying-american-west-east-coast) and the [Springfield-Greene County Library's review of the Hickok–Tutt shooting](https://www.thelibrary.org/post/the-shootout-on-the-square).
Rejected: 205-r-1. Agreed signal: Require duelists to wait for a signal before drawing.

206. [SETTLED] Duel judgment: Witnesses and the law may judge a duel according to its circumstances, including threats and who drew or fired first. The possible consequences and the conditions for judgment are specified in items 216 and 220.
Rejected: 206-r-1. Fixed first-move penalty: Automatically apply a predictable reputation or legal penalty to whoever draws or fires first.
Rejected: 206-r-2. No outside judgment: Give the duel no consequences from bystanders or the law.

207. [SETTLED] Duel opportunities: Challenges to the sheriff or crew originate only in saloons. They can arise from disputes, such as gambling or insults, or from a gunslinger's desire to make a name. Challenges remain rare as specified in items 193 and 198.
Rejected: 207-r-1. Challenges elsewhere: Have gunslingers challenge the sheriff or crew on the road or in other town locations.

208. [SETTLED] Spectating duels: The player can spectate duels between other people that arise from saloon encounters.

209. [SETTLED] Duel venue: Saloon challenges that proceed to a duel take the opponents outside. The outdoor location and distance between them can vary.
Rejected: 209-r-1. Indoor duels: Allow the quick-draw duel to take place inside the saloon.

210. [SETTLED] Persuasion approaches: When the sheriff is challenged, offer intimidation and explanation as dialogue approaches. Persuasion, including a teammate's autonomous attempt, depends on the dispute and situation, the opponent's personality, and the challenged person's reputation and skills.

211. [SETTLED] Duel weapons: Duelists use their equipped revolvers and available ammunition. An unarmed crew member, or one whose revolver is unloaded, borrows a usable revolver from a teammate. When no teammate can lend one, item 219 applies.

212. [SETTLED] Duel movement: During the quick-draw exchange both duelists stand in place; neither moves to seek cover. Involuntary movement from hits follows item 353.
Rejected: 212-r-1. Movement during the exchange: Allow duelists to move about or seek cover during the quick draw.

213. [SETTLED] Opponent behavior: The gunslinger's decisions about drawing respond to personality and the player's actions. The player can observe subtle cues of the opponent's intent as specified in item 222.

214. [SETTLED] Duel exchange and conclusion: After shooting starts, a miss or a non-incapacitating hit does not automatically end the exchange. A duelist who remains able and willing can fire again with available ammunition under the shared weapon rules. The exchange ends when a participant falls to the ground as specified in item 356, or when the participants stop fighting; a duelist can surrender, but surrender does not automatically stop an opponent who continues to attack. De-escalation remains possible after shooting stops. This applies to duels and does not change the breach-hostile rule in item 46. It is a gameplay interpretation of the evidence, not a universal historical rule: the [Tarrant County history of Fort Worth](https://www.tarrantcountytx.gov/content/dam/main/archives/Fort_Worth_History.pdf) describes multiple shots in the 1887 Short–Courtright confrontation; accounts differ on its details.
Rejected: 214-r-1. Single-shot exchange: Automatically finish the duel after each side fires once.
Rejected: 214-r-2. First hit ends it: Automatically finish the duel on any hit, regardless of its effects.

215. [SETTLED] Duel consequences for participants: Use the existing campaign and tactical rules for ammunition, wounds, permanent death, and succession, without duel-specific exceptions. Apply the resulting changes to participants in the campaign.

216. [SETTLED] Duel judgment consequences: Witness and legal judgment of a duel can result in reputation changes and fines, according to circumstances as specified in item 206. Consider threats, who drew or fired first, and accurate witness accounts when present; do not impose a fixed penalty merely for drawing or firing first. Exact thresholds, amounts, and reputation magnitudes are implementation and playtesting parameters.

217. [SETTLED] Teammate duel transition: Notify the player of a teammate's challenge only after the teammate's autonomous attempt at persuasion fails. When the duel is over, return to the sheriff and resume the interrupted rest.
Rejected: 217-r-1. Immediate notification: Notify the player of the teammate's challenge before the teammate attempts persuasion.

218. [SETTLED] Gunslinger continuity: Gunslingers have names, persistent identities, reputations, and memories of previous encounters. A surviving gunslinger can be encountered again.
Rejected: 218-r-1. One-off gunslingers: Treat gunslingers as disposable characters with no continuity beyond an individual encounter.

219. [SETTLED] Weapon availability for a challenge: If a crew member would need to borrow a loaded revolver for a duel and no teammate can lend one, a duel challenge to that person is unavailable.
Rejected: 219-r-1. Postponed challenge: Issue the challenge and postpone the duel while a suitable weapon is found.
Rejected: 219-r-2. Unarmed duel: Issue the challenge and proceed with the challenged person unarmed.

220. [SETTLED] Duel witnesses: Witness accounts accurately reflect the duel's events; witnesses do not miss or misinterpret events and give conflicting judgments for that reason. This does not require witnesses to be present in every duel. Reputation changes and fines follow items 206 and 216.
Rejected: 220-r-1. Unreliable accounts: Allow witnesses to miss or misinterpret events and give conflicting accounts for those reasons.

221. [SETTLED] Interrupted duel: If the game closes during a duel, Continue restarts that same duel from its beginning, with the same participants and pre-duel equipment and ammunition. Preserve the challenge and failed persuasion; discard the interrupted exchange's partial effects so they are not applied twice. After a teammate's duel is completed, return to the sheriff and interrupted rest as specified in item 217.

222. [SETTLED] Duel cues: The opponent can give subtle physical cues, such as moving a hand toward the holster. A cue does not guarantee an imminent draw: it may be a bluff or an innocent movement. Show the actual draw through the opponent's physical animation; do not require a countdown or a separate warning before every draw.
Rejected: 222-r-1. Infallible tells: Make each cue toward the weapon a reliable sign that the opponent is about to draw.

223. [SETTLED] Duel acceptance: Verify rare saloon-origin challenges and the opportunity to spectate other people's duels; ensure no challenge is offered to a crew member who needs a borrowed loaded revolver when none is available. Verify sheriff-directed and autonomous teammate persuasion, the challenged teammate's autonomous duel after failed persuasion, spectated by the player with an optional skip, outside positioning, standing in place, unsignaled draw, aiming, firing, subtle cues, and the possible continuation or end of an exchange. Verify shared ammunition, wound, death, and succession rules; persistent gunslingers; contextual reputation and fines with accurate witness accounts; restarting an interrupted duel without retaining partial effects; and return to the sheriff and rest after a teammate's duel. Use reproducible scenarios.

224. [SETTLED] Fistfight intervention actions: The sheriff can punch and grapple when intervening in a saloon fistfight. Their effects and the remaining fight mechanics are specified in the fistfight items.

225. [SETTLED] Fistfight circumstances: Saloon patrons can fight each other as well as crew members. Fights can arise from drinking, gambling disputes, or insults. The sheriff can respond to a fight but cannot initiate one.
Rejected: 225-r-1. Sheriff-initiated fistfights: Allow the player-controlled sheriff to start a saloon fistfight.

226. [SETTLED] Grappling: The sheriff can use grappling to hold or incapacitate someone in a fistfight.

227. [SETTLED] Fistfight escalation: A saloon fistfight can escalate into gunfire.
Rejected: 227-r-1. Always unarmed: Keep all saloon fistfights from escalating into gunfire.

228. [SETTLED] Fistfight resolution: A fight ends when all aggressors are knocked out, flee, or surrender. If all defending participants, including the sheriff when intervening, can no longer fight while aggressors remain active, the fight ends as a loss.

229. [SETTLED] Fistfight injuries and losses: Unarmed fighting can cause injuries, including permanent impairments or death. A fistfight, including an escalation into gunfire, does not itself deduct money or cause participants to lose equipment. Gunfire continues to use the existing ammunition, wound, and permanent-death rules.

230. [SETTLED] Staying out of a teammate's fight: If a teammate gets into a saloon fight and the sheriff stays out, report the result afterward and reduce loyalty.
Rejected: 230-r-1. Spectating instead of a report: Have the player watch the teammate's fight when the sheriff stays out.

231. [SETTLED] Interrupted fistfight: If the game closes during a fistfight, Continue restarts that fight from the beginning. Preserve its starting participants and state, and discard the interrupted fight's partial effects so they are not applied twice.

232. [SETTLED] Fistfight reputation: A saloon fistfight does not change reputation, including when it escalates into gunfire. This does not change the duel judgment rules in items 206 and 216.

233. [SETTLED] Fistfight acceptance: Verify fights involving patrons and crew can begin during saloon activity, while the sheriff cannot initiate one. Verify real-time intervention with punches and grapples, possible escalation into gunfire, defeat of all aggressors by knockout, flight, or surrender, and a loss when defenders cannot continue. Verify possible temporary, permanent, and fatal unarmed injuries; no loss of money or equipment or reputation change from the fight; a report and loyalty drop when the sheriff stays out of a teammate's fight; and restarting an interrupted fight without retaining partial effects. Use reproducible scenarios.

234. [SETTLED] World boundary: Use the contiguous United States from the Mississippi Valley to the Pacific as the playable Old West. For an explicit, implementable boundary, include the entirety of these 1881 states: Louisiana, Arkansas, Missouri, Iowa, Minnesota, Texas, Kansas, Nebraska, Colorado, Nevada, California, and Oregon; the territories of Dakota, Montana, Wyoming, Idaho, Washington, Utah, Arizona, and New Mexico; Indian Territory; and the Public Land Strip. Do not extend the playable world into Canada, Mexico, or Alaska. This is a scope choice informed by research, not a uniquely authoritative historical definition: the [Oxford bibliography on the American West](https://academic.oup.com/reference/62333/reference-article-abstract/554072330) describes a common Mississippi Valley-to-Pacific framing and notes that historians disagree over boundaries; the [Oklahoma Historical Society](https://www.okhistory.org/publications/enc/entry?entry=NO001) documents the Public Land Strip's distinct status.

235. [SETTLED] Travel: Use destination-based map travel and journey rules as specified in items 100, 172, and 173 across the world. Do not require continuous real-time travel between destinations.
Rejected: 235-r-1. Continuous travel: Replace map journeys with real-time riding or walking through the world.
Rejected: 235-r-2. Required mixed travel: Require real-time traversal in selected areas as part of journeys between destinations.

236. [SETTLED] Settlement coverage: Include every settlement in the playable area for the game's historical setting as a world location, rather than selecting only major or representative places, subject to the camp and post exception in item 239 and the individual-property exclusion in item 243. Discovery and destination selection continue to follow item 172.
Rejected: 236-r-1. Representative selection: Include only a representative mix of major and minor settlements.
Rejected: 236-r-2. Significant settlements only: Restrict coverage to settlements judged significant.

238. [SETTLED] Settlement research and evidence: Build the settlement inventory from period-appropriate sources, record source provenance and uncertainty, and document gaps or limitations without claiming that surviving records prove absolute completeness. The [1880 census population volumes](https://www.census.gov/library/publications/1883/dec/vol-01-population.html) and [USGS geographic names data](https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data) are research starting points; a present-day name or a USGS historical designation alone does not establish that a settlement existed in the game's period.

239. [SETTLED] Camps and posts: Camps and posts are exceptions to exhaustive settlement coverage. If camps or posts are included as world locations, include only well-known examples; including such examples is optional.
Rejected: 239-r-1. Exhaustive camps and posts: Require all camps and posts in the world to be represented.

240. [SETTLED] Settlement services: Offer only services appropriate to a settlement's historical circumstances, size, and location. A settlement is not required to have every service or a saloon.
Rejected: 240-r-1. Uniform services: Give every settlement the same set of services regardless of its circumstances.

241. [SETTLED] Playable town interiors: For ordinary town life, the saloon is the only playable interior. Other town services and locations use the town menu. This does not remove playable tactical encounters at other types of site.
Rejected: 241-r-1. Other playable town interiors: Require shops, doctors' offices, hotels, or sheriff's offices to have playable interiors for ordinary town life.

242. [SETTLED] Settlement time model: Use a fixed snapshot of settlements from 1881. Settlements do not appear or disappear because campaign time advances; time continues to pass for the rest of the campaign under the existing rules. Document the selected snapshot date during implementation.
Rejected: 242-r-1. Changing historical settlements: Add or remove settlements as campaign time passes to follow their historical founding or disappearance.

243. [SETTLED] Individual properties: Do not give individual ranches or homesteads their own map entries as settlements. This does not prohibit depicting them in travel encounters or other scenes.
Rejected: 243-r-1. Individual-property destinations: Include individual ranches and homesteads as separate settlement entries on the map.

244. [SETTLED] Saloon interaction: Inside a playable saloon, the player moves the sheriff in real time and interacts with people and furnishings. Provide drinks, meals where available, conversations, and gambling where available. Time spent on saloon activities advances the campaign clock and its existing consequences. Patrons can provide case information or leads through the existing information and discovery rules; do not reveal case knowledge the patron could not realistically have.
Rejected: 244-r-1. Static saloon screen: Make ordinary saloon activities selectable only from a static screen without moving through the interior.

245. [SETTLED] Gambling choices and results: Where available, let the player select a gambling game and a positive stake that does not exceed available cash. Support poker and faro, without playing individual hands: advance time, resolve the selection, show the net win or loss, and apply it to campaign cash. Game availability may differ by saloon and numerical odds are implementation parameters. An [1883 newspaper account of gambling in Leadville](https://www.loc.gov/resource/sn87068079/1883-06-28/ed-1/?st=text) names poker and faro among the games played there; it does not establish their availability in every saloon.
Rejected: 245-r-1. Generic gambling only: Provide one undifferentiated gambling action with no choice of game or stake.

246. [SETTLED] Teammate saloon eligibility: Autonomous saloon visits during rest are limited to teammates physically present in the sheriff's current town. Teammates left in other towns do not make autonomous saloon visits while the sheriff is elsewhere.
Rejected: 246-r-1. Visits in other towns: Allow teammates left elsewhere to visit saloons autonomously while the sheriff rests in a different town.

247. [SETTLED] Saloon visit notifications: Do not announce trouble-free autonomous teammate visits. Notify the player when trouble requires a response, in time to choose whether the sheriff intervenes; teammate duel challenges follow the failed-persuasion notification rule in item 217.
Rejected: 247-r-1. Announce every visit: Notify the player whenever a teammate goes to a saloon, regardless of trouble.

248. [SETTLED] Ordinary saloon patrons: Generate ordinary patrons for each visit rather than maintaining persistent identities and memories for them. This does not affect the persistence of gunslingers, crew, cases, or campaign information.
Rejected: 248-r-1. Persistent ordinary patrons: Require ordinary saloon patrons to retain identities and memories between visits.

249. [SETTLED] Assistance for the sheriff: When the sheriff gets into a saloon brawl, teammates present in the same town and able to participate can autonomously come to the sheriff's assistance. Apply existing character capability and encounter-party limits. This concerns brawls and does not change the duel rules.

250. [SETTLED] Saloon-life acceptance: Verify real-time movement and interaction in an available saloon; drinks, meals, conversation, case information, and simple gambling as locally available; valid stakes, elapsed time, and correct displayed and recorded gambling outcomes. Verify ordinary patrons need no cross-visit persistence while gunslingers and campaign state remain persistent; autonomous visits involve only teammates in the sheriff's town, trouble-free visits are not announced, and trouble is reported in time for applicable choices. Verify eligible teammates can join a brawl to help the sheriff, together with the fight and duel checks in items 223 and 233.

251. [SETTLED] Additional town activities: The game does not require new town activities beyond the specified saloon life and existing town services. In particular, new general town incidents and active sheriff duties such as responding to crimes or making arrests are outside this scope. Existing cases and travel encounters, and the outdoor venue of a saloon-origin duel, remain in scope.
Rejected: 251-r-1. New town incidents: Add general town disturbances, robberies, or similar events outside the specified saloon life.
Rejected: 251-r-2. New sheriff duties: Add active town-law-enforcement duties such as responding to crimes or making arrests.

253. [SETTLED] Teammate visit trouble scope: The required trouble events for autonomous teammate saloon visits are the specified fistfights and gunslinger challenges. Other teammate saloon incident types are not required.

254. [SETTLED] World and town acceptance: Verify a fresh campaign uses the start in item 301 and retains the applicable campaign systems, and uses destination-based map travel across the complete world boundary in item 234. Verify all settlements required by items 236, 239, and 243 are represented for the 1881 snapshot, can be discovered and reached under the existing rules, and offer only locally appropriate services. Audit the world inventory against its period sources and document limitations rather than claiming unprovable absolute completeness. Verify the sole ordinary playable town interior is the saloon, and that no additional town activities are required beyond item 251. Verify saloon-life, fistfight, and duel acceptance in items 250, 233, and 223, including persistence, time, resources, loyalty, teammate assistance, and interrupted-scene recovery. Use reproducible scenarios and retain the applicable campaign checks in item 177.

255. [SETTLED] Aiming at exposed targets on stairs: When the sheriff aims at a visible enemy across a staircase and an exposed part of that enemy can be reached by a shot, aim at a reachable exposed part rather than defaulting to an obstructed part. Apply the same visibility and projectile geometry to enemies aiming at targets. Cover, weapon accuracy, and ordinary chances of missing still apply; visibility alone does not guarantee a hit or a clear shot.
Rejected: 255-r-1. Manual precision: Require the player to aim precisely at the exposed part instead of providing this target-height assistance.

256. [SETTLED] Staircase ambush and perception: An upstairs enemy may see and shoot the sheriff before the sheriff can see or react to that enemy when position, facing, awareness, and the ordinary combat rules permit. Show threats consistently with the sheriff's actual line of sight, and do not give enemies an artificial staircase-specific advantage.
Rejected: 256-r-1. Guaranteed warning: Always give the sheriff an opportunity to see and react to an enemy before that enemy can shoot during a staircase encounter.

257. [SETTLED] Staircase projectile impacts: A bullet that strikes staircase geometry, a floor, railing, or another obstacle must collide with that obstacle and produce the corresponding impact sound. Apply the ordinary material and penetration rules.

258. [SETTLED] Staircase difficulty: Preserve the ordinary combat rules and let the outcome follow the tactical situation, without targeting a particular sheriff win rate for staircase encounters.
Rejected: 258-r-1. Explicit balance target: Set a target outcome or win rate for a defined staircase encounter and tune combat to meet it.

259. [SETTLED] Staircase battle acceptance: Use reproducible encounters to verify aiming and firing both up and down stairs, including a target whose chest is obstructed but another part is exposed. Check that targeting uses a reachable exposed part, that shots still respect accuracy and material penetration, and that struck obstacles produce their corresponding impact sounds. Verify perception and projectile geometry for the sheriff and enemies, including an upstairs ambush allowed by their actual positions, facing, awareness, and normal reaction rules. Check that the player's displayed view agrees with the sheriff's line of sight. Do not judge acceptance against a target win rate.

260. [SETTLED] Targeting without a crosshair: When the sheriff aims toward a visible character, select an appropriately aligned target along the aim direction without requiring the hidden pointer to be at the target's distance. Use the target's current posture and the existing normal or high-aim rules to determine shot height; apply the exposed-target rule in item 255 across stairs. Preserve ordinary accuracy, line of sight, cover, projectile collision, and friendly fire. Do not add a crosshair. Verify with reproducible same-floor and cross-floor scenarios, including a standing and a crouched target and hidden pointer positions both on and beyond the target, with ordinary miss and obstruction cases.
Rejected: 260-r-1. Hidden-point targeting: Require the hidden pointer to be close to the target in world space before its posture determines shot height.

261. [SETTLED] Saloon character movement: In the ordinary playable saloon interior, the sheriff and patrons can pass through and overlap one another without blocking movement. Walls and furniture remain solid. This rule applies to ordinary saloon life and does not change collision rules for brawls or tactical encounters. Verify that the sheriff and moving patrons can pass through people while walls and furniture still prevent movement.
Rejected: 261-r-1. People block movement: Prevent the sheriff or patrons from moving through other characters in the ordinary saloon interior.

262. [SETTLED] Saloon and duel music: Play a separate original honky-tonk piano tune in the saloon. Play a separate, quiet, dark and distant suspense tune from the duel challenge screen through the exchange, including watched duels. Return to the appropriate music when the scene changes. These tracks follow the shared sound setting and browser autoplay and visibility rules; their exact composition and volume are implementation and playtesting parameters. Verify that each tune starts in its intended scene, the duel tune begins on the challenge screen and continues into the exchange, and mute and scene transitions work.

264. [SETTLED] Main character: The main story begins with the player character serving as a deputy in a rough town.

265. [SETTLED] The sheriff's death: One day, the nemesis kills the sheriff in the deputy's presence. The deputy sees the killing, and the nemesis rides away.

266. [SETTLED] Revenge quest: After the sheriff's death, the deputy takes up the sheriff's star and pursues the nemesis on a quest for revenge.

267. [SETTLED] Revenge confrontation: The main story culminates in a duel to the death between the sheriff pursuing revenge and the nemesis.

268. [SETTLED] Pursuit and leads: The search advances naturally through occasional pieces of information gathered from solved cases, saloons, and the road. The player hunts for these clues through ordinary campaign play; do not make the pursuit a scripted sequence of story missions.

269. [SETTLED] Revenge payoff: The campaign ends when revenge is attained, with a win for the player. This fixed objective applies to every campaign.

270. [SETTLED] Continuing the quest: If the sheriff pursuing revenge dies before completing the quest, a successor may continue it in the name of the office, but only if the successor is very loyal. Exact loyalty thresholds are implementation and playtesting parameters. A successor can continue the final duel as specified in item 278.

271. [SETTLED] Opening vignette: Present the sheriff's murder, witnessed by the deputy, in an illustrated opening vignette cutscene.

272. [SETTLED] Initial knowledge of the nemesis: At the start of the pursuit, the deputy knows the nemesis's identity but not their whereabouts.

273. [SETTLED] Lead journal: Give the player a journal of discovered clues to the nemesis's whereabouts. Record clues the player has actually discovered without exposing unknown information.
Rejected: 273-r-1. Dialogue and memory only: Provide no journal for reviewing discovered clues.
Rejected: 273-r-2. Explicit progress indicator: Add an explicit progress indicator alongside the clue journal.

274. [SETTLED] No loyal successor: If the sheriff pursuing revenge dies and no successor is loyal enough to continue the quest, the campaign ends in failure.

275. [SETTLED] Generated nemesis: Generate a different nemesis for each new campaign. The nemesis has the known identity established in item 272.
Rejected: 275-r-1. Fixed nemesis: Use the same named nemesis in every campaign.

276. [SETTLED] Murder motive: Leave the reason the nemesis killed the sheriff uncertain; do not require a definitive explanation of the motive.

277. [SETTLED] Associate cases: Leads point to locations and associates of the nemesis. Special cases in which the office tracks down those associates bring it closer to discovering the nemesis's final location. These cases arise within the natural, unscripted pursuit in item 268 and follow items 279 and 280.

278. [SETTLED] Duel succession: If the sheriff pursuing revenge dies in the final duel and the nemesis survives, a very loyal successor can continue the confrontation in a new duel later. The successor knows where to find the nemesis for that later duel.
Rejected: 278-r-1. Immediate replacement: Have the successor immediately take the deceased sheriff's place in the same confrontation.

279. [SETTLED] Associate case availability: Special cases involving the nemesis's associates appear on ordinary town notice boards. Pursue the three associates in sequence: the next associate case becomes available only after the previous associate has been taken down. They remain part of the natural, unscripted pursuit.

280. [SETTLED] Associate case resolution: Successfully resolve an associate case by capturing the associate alive for questioning, using the methods in item 291. The questioning produces information that advances the pursuit. If the associate dies before questioning, the office can recover the information another way, as specified in item 283.

281. [SETTLED] Final location: Take down three associates in sequence and follow their leads to reveal the nemesis's final location. Taking an associate down includes capturing them alive or killing them; obtain their information under items 280 and 283. Do not reveal the final location before the three have been taken down and the relevant leads discovered. Other numerical rates are implementation and playtesting parameters.
Rejected: 281-r-1. Implementation-selected count: Leave the number of associates required to reveal the final location to implementation and playtesting.

282. [SETTLED] Questioning associates: Questioning a captured associate is resolved automatically after a successful capture, rather than through a player-directed dialogue or a playable interrogation scene.
Rejected: 282-r-1. Dialogue choice: Require the player to choose how to question the associate.
Rejected: 282-r-2. Playable interrogation: Require the player to play an interrogation scene.

283. [SETTLED] Dead associate's lead: If an associate dies before questioning, the office can recover the information another way. Recovery uses the sources and methods in item 286.
Rejected: 283-r-1. Lost lead: Make the information permanently unavailable from that case when the associate dies.
Rejected: 283-r-2. Automatic quest failure: End the revenge quest solely because an associate dies before questioning.

284. [SETTLED] Nemesis movement: The nemesis can move between locations while the office follows leads, until the final location is revealed as specified in item 290. Previously discovered location clues follow item 287.

285. [SETTLED] Successor's later duel: After the sheriff dies in the final duel and a very loyal successor takes up the quest, that successor knows where to find the surviving nemesis for their later duel.

286. [SETTLED] Alternative lead sources: When an associate dies before questioning, recover their information by searching their body or belongings, through witnesses or other leads, or by using both kinds of source, as appropriate to the case. Do not reveal information before the office discovers it.

287. [SETTLED] Historical location clues: A discovered lead about the nemesis's location records what was known at the time; it can become outdated if the nemesis moves. Do not automatically update that lead to the nemesis's new location.
Rejected: 287-r-1. Automatically current leads: Automatically update a discovered location clue when the nemesis moves.

288. [SETTLED] Beginning the final duel: Once the sheriff reaches the nemesis, the player chooses when to approach and begin the final confrontation.
Rejected: 288-r-1. Nemesis-initiated confrontation: Require the nemesis to initiate the final confrontation.

289. [SETTLED] Associate case identification: A notice board may identify a case as connected to the nemesis when that connection is known; otherwise, the connection may be discovered during the case. Show only information the office has actually learned.

290. [SETTLED] Final location stability: Once the nemesis's final location is revealed, the nemesis stays there. A successor who continues the quest knows where to find the surviving nemesis for the later duel as specified in item 285.
Rejected: 290-r-1. Renewed search: Let the nemesis leave after the final location is revealed, requiring the office to follow new leads to find them again.
Rejected: 290-r-2. Automatic relocation updates: Let the nemesis move after the final location is revealed and automatically inform the office of the new location.

291. [SETTLED] Capturing associates: The office can capture an associate alive by obtaining their surrender or by restraining them after incapacitation, when circumstances permit. These options apply to associate cases and are an exception to the ordinary breach-hostile rule in item 46. Associate cases retain their own capture rules; item 492 governs ordinary wanted targets.

292. [SETTLED] Lead reliability: Leads about the nemesis are accurate when received and are not false or misleading. Location information may subsequently become outdated if the nemesis moves, as specified in item 287.
Rejected: 292-r-1. Misleading leads: Allow a lead to be false or misleading when received.

293. [SETTLED] Opening timing: Show the illustrated opening vignette at the start of a new campaign.
Rejected: 293-r-1. Later opening: Delay the vignette until after playable time as the deputy.

294. [SETTLED] Deputy command mapping: In both voice and hand-signal modes, 1 selects Cover me, 2 selects Hold here, 3 selects Push, and 4 selects Fall back. Push and Fall back replace Clear and Hostile spotted on keys 3 and 4. The commands use the tactical zone model and behaviors in items 412 and 413. The existing speech, hearing, and hand-signal perception rules and independent tactical judgment remain in effect.
Rejected: 294-r-1. Previous voice mapping: Retain Clear and Hostile spotted as voice commands 3 and 4.
Rejected: 294-r-2. Different hand-signal mapping: Use different commands on hand-signal keys 3 and 4.

295. [SETTLED] Knife takedown: In all tactical encounters, the player can attempt a knife takedown on a hostile within range when approaching from behind or the side. A successful takedown always kills the hostile. The hostile need not be unaware, but the positioning requirement still applies. The exact range and input are implementation and playtesting parameters. This requirement does not add a knife takedown to saloon brawls.
Rejected: 295-r-1. Unaware targets only: Permit a takedown only when the hostile is unaware.
Rejected: 295-r-2. Any approach direction: Permit a takedown from the front as well as from behind or the side.
Rejected: 295-r-3. Nonlethal or variable outcome: Allow the hostile to survive a successful takedown.

296. [SETTLED] Command and takedown acceptance: Verify the four key mappings in voice and hand-signal modes, their normal perception requirements, and the zone-based behavior of all four commands under items 412 and 413. In indoor and outdoor tactical encounters, verify knife takedowns from behind and the side, including against an aware hostile, rejection from the front or outside range, and the fatal outcome of a successful takedown.

297. [SETTLED] Sheriff terminology: The murdered sheriff exists only as the story trigger. Throughout the specification, "the sheriff" means the main character after taking up the star to pursue revenge, or a successor continuing the quest under item 270.

298. [SETTLED] Final duel terms: The nemesis never surrenders or flees in the final duel. Only the nemesis's death in a duel with the sheriff counts as revenge. This overrides item 214's surrender and de-escalation options for the final duel only. A fall in the final duel follows item 357.
Rejected: 298-r-1. Death or capture: Let a badly wounded nemesis surrender, and count either killing or arresting the nemesis as revenge.
Rejected: 298-r-2. Nemesis may flee: Let a badly wounded nemesis try to escape, requiring the office to find them again after a successful escape.

299. [SETTLED] No early nemesis encounter: The office cannot encounter the nemesis before all three associates have been taken down. The final location remains undisclosed until the requirements in item 281 are met.
Rejected: 299-r-1. Already moved on: The nemesis is always gone when the office arrives, leaving only a fresh trace.
Rejected: 299-r-2. Nemesis flees on sight: The office glimpses the nemesis, who escapes and may leave a new lead.
Rejected: 299-r-3. Early final duel: Allow a final duel before all three associates have been taken down.
Rejected: 299-r-4. Early contact without a final duel: Allow an encounter with the nemesis before all three associates have been taken down but defer the final duel.
Rejected: 299-r-5. Early tactical confrontation: Allow an early tactical confrontation that is not the final duel.

300. [SETTLED] Nemesis depiction: Compose every vignette showing the nemesis from their assembled portrait (item 311), matching their in-game sprite, together with their generated name and traits.
Rejected: 300-r-2. Obscured figure: Show a fixed silhouette with the face shadowed, carrying identity through name and description text.
Rejected: 300-r-3. Fixed art, generated text: Use the same illustration in every campaign, with only the generated name and traits as text.
Rejected: 300-r-4. Fixed scene plus portrait: Keep the opening illustration fixed with the killer's face hidden, and show the assembled portrait alongside it.
Rejected: 300-r-5. Faceless until found: Keep the fixed art and show the nemesis's portrait only once the office reaches them.

301. [SETTLED] Campaign start state: Each new campaign starts in a rough town chosen at random from the world's settlements. After the murder, the sheriff starts alone with a horse and recruits through ordinary town notices. Starting funds and the criteria for a rough town are implementation parameters.
Rejected: 301-r-1. Tombstone, lone sheriff: Start in Tombstone with the sheriff alone.
Rejected: 301-r-2. Tombstone, plus a deputy: Start in Tombstone with a second deputy remaining.

302. [SETTLED] Final duel setup: The final duel uses the duel mechanics at the nemesis's location, under the terms in item 298. The crew may spectate but cannot interfere.
Rejected: 302-r-1. Crew may interfere: Let teammates intervene in the final duel at a cost in reputation or loyalty.
Rejected: 302-r-2. Special showdown scene: Use a dedicated scene with its own rules at a site chosen for the nemesis.

303. [SETTLED] Final location after reveal: Once the final location is revealed under item 281, item 290 applies, so a successor knows where to find the surviving nemesis. Earlier encounters are prohibited under item 299.
Rejected: 303-r-1. Resumes moving: After an early duel the sheriff loses, the nemesis leaves and the successor must follow new leads.

304. [SETTLED] Ending presentation: Present the win and failure endings as illustrated closing vignettes, like the opening, composed with the characters' assembled portraits and names.
Rejected: 304-r-1. Summary screen only: Show a text screen with the outcome, a campaign summary, and the journal.
Rejected: 304-r-2. Vignette plus summary: Show the vignette, then a campaign summary screen.

305. [SETTLED] Outside successor: An outside sheriff staffed under item 181 is never very loyal and cannot continue the revenge quest. If no surviving deputy qualifies under item 270, the campaign ends in failure under item 274.
Rejected: 305-r-1. Loyal crew hands over: Let an outside sheriff continue when the surviving crew is very loyal.

306. [SETTLED] Story acceptance: Verify that a new campaign shows the opening vignette composed with the generated nemesis's portrait, name, and traits, starts in a random rough town with a lone sheriff and a horse, and generates a different nemesis each campaign. Verify that leads arise from solved cases, saloons, and the road; that the journal shows only discovered clues; and that leads are accurate when received but can become outdated as the nemesis moves. Verify that associate cases appear on notice boards, marked as connected only when known; that capture by surrender or restraint leads to automatic questioning; and that a dead associate's lead can be recovered from the body, belongings, or witnesses. Verify that three associates are taken down in sequence before their leads reveal the final location, that the nemesis then stays there, and that the player chooses when to begin the duel. Verify that the office cannot encounter the nemesis before all three associates have been taken down under item 299. Verify that the final duel uses the duel mechanics, that the nemesis neither surrenders nor flees, that the crew can only spectate, and that only the nemesis's death wins and shows the win vignette. Verify that a very loyal successor continues the quest and knows the nemesis's location, and that otherwise the campaign fails and shows the failure vignette. Verify that every named character has a stable assembled portrait that shows wounds, and that the swearing in, deaths, town arrivals, discovered leads, duels, and brawls are staged as specified in items 313–316, with sound effects under items 327–330, and that the staged scenes follow the storyboards under item 393. Verify the team limits in item 322 at each reputation band for the office and chosen encounter teams, counting hired hands under item 324; that a road ambush includes every traveling teammate under item 325; and that a reputation drop makes the least loyal teammates above the cap leave. Verify that right-click starts the duel draw without a tracing gesture (item 343), and that the fixed-size two-ring aim is centered on the main duel view and settles, the outer ring follows sight-picture jitter, the mouse moves the inner ring, an aligned shot follows the ray, and an unaligned shot has error related to ring separation (items 344, 347 and 348). Verify that skill, wounds, fatigue, and intoxication affect sway, and that each shot after the first needs cocking while fanning fires faster but less accurately (item 345). Verify that every duel hit jolts the body by region (item 353) with a small shove and a clear bodily reaction (item 360), that falls follow item 354, that a standing hit duelist cannot fire until the stagger ends (item 355), that a fall ends an ordinary duel while a finishing shot is judged under item 359, that a simultaneous fall is a draw, and that the final duel continues until a duelist is dead (item 357). Verify that the weapon roster holds fifteen to twenty documented models available by 1881 across handguns, rifles and carbines, and shotguns (items 361–363, 370); that their caliber, action, loading, accuracy, range, and weight differ in play (item 364); that stores stock them by town size and region and hostiles carry them by role (item 365); that scavenged weapons are handed over after an encounter (item 366); that carry limits, per-cartridge ammunition with shared calibers, and occasional misfires apply (items 367–369). Verify that drinking produces the effects in item 346 for every character, grows with the amount drunk, wears off, and leaves a hangover; that the player sees it through screen effects and campaign conditions (item 349); and that teammates drink on visits by temperament and habit, pay from their wages, drink on credit with a loyalty loss when wages are overdue, and carry intoxication into departures and encounters (items 350 and 351). Use reproducible, seeded scenarios.

307. [SETTLED] Death ceremony: Present each crew death as a solemn, staged screen rather than a brief note. Make the sheriff's death longer and darker, followed by a second beat showing who takes up the star under the succession rules. Exact wording, order, and timing are implementation parameters.

308. [SETTLED] Pointer in saloon and fistfight: Hide and capture the mouse pointer on the playable saloon floor and during fistfights, as in item 187.

309. [SETTLED] Menu theme: The menu soundtrack is an intricate, suspenseful, rhythmic, and punchy original Western theme, roughly seven minutes or longer, at the level of the earlier theme. It resumes where it stopped after any scene switch, including saloons, duels, and tactical encounters; a new page load starts it from the beginning.

310. [SETTLED] Western theatrics: Realize the theatrics and drama of the West. The swearing in, brawls, and duels gain real depth through presentation such as character portraits and vignettes. The presentation requirements in items 310–316 apply throughout the game. The moments covered and their form are specified in the vignette items.

311. [SETTLED] Character portraits: Every named character, including crew, the nemesis, associates, and gunslingers, has a small portrait assembled from layered parts such as face, hair, hat, scars, and wounds. A character's portrait stays the same throughout the campaign apart from visible changes such as wounds.
Rejected: 311-r-1. Crew only: Give assembled portraits only to the sheriff and deputies, and use role art for everyone else.
Rejected: 311-r-2. Fixed per role: Use a small set of hand-made portraits per role without per-character variation.

312. [SETTLED] Vignette presentation: The specification does not prescribe a drawing style, medium, palette, shading technique, or texture for vignettes and their portraits. Preserve each character's established look and recognizable identity using the assembled parts in item 311, including current wounds. Compose each vignette panel as one integrated scene under item 396. Portraits may take the pose and orientation the scene needs; their assembled identity does not require a separate front-facing portrait element. Tactical play retains the pixel graphics in item 9.
Rejected: 312-r-4. Prescribed ink style: Require vector-like Western ink illustrations with heavy outlines, simplified shapes, flat colors, halftone shading, aged-paper texture, a muted earthy palette, and separate front-facing portraits. This supersedes the previous drawing-style decision; engraved, painted, and pixel-art approaches are no longer excluded by this specification.

313. [SETTLED] Swearing in: Stage every swearing in as an illustrated vignette with portraits, the oath text, and the badge being pinned on. This covers every succession and every new deputy. The opening has no oath; the deputy takes up the star within the opening under item 379.
Rejected: 313-r-1. Sheriff only: Stage only the sheriff's oath and keep recruiting a deputy as a menu action.
Rejected: 313-r-2. Playable ceremony: Play the swearing in as a short playable scene in town.

314. [SETTLED] Further dramatic moments: Stage deaths by adding the fallen's portrait to the ceremony in item 307, give the arrival in a town an establishing vignette, and mark a newly discovered lead about the nemesis with a short dramatic beat.
Rejected: 314-r-1. Capture and questioning: Give an associate's capture and automatic questioning a vignette.

315. [SETTLED] Duel staging: Stage every duel as a full arc. Before the exchange, show a challenge vignette with both duelists' portraits facing off and onlookers; the stakes are left unstated. Hold a standoff beat before the draw. After the exchange, show a vignette of the outcome with the portraits of the victor and the fallen.
Rejected: 315-r-1. Intro and outcome only: Show a face-off card before and an outcome card after, leaving the exchange unchanged.
Rejected: 315-r-2. Standoff close-ups: Use no cards and zoom in on the duelists' portraits during the standoff.

316. [SETTLED] Brawl staging: Open every brawl with a card showing the fighters' portraits and who started it, and close it with an aftermath card reporting injuries and costs. The fight itself is unchanged.
Rejected: 316-r-1. Full arc: Add knockdown freezes with portraits and crowd reactions during the fight.
Rejected: 316-r-2. In-scene only: Use no cards, only crowd reactions, freezes, and portrait pop-ups within the brawl scene.

318. [SETTLED] Single campaign: A new campaign is always the revenge story; no separate open-ended campaign remains.
Rejected: 318-r-1. Both modes: Offer the revenge story and an open-ended Tombstone campaign from the new-game menu.
Rejected: 318-r-2. Open-ended after revenge: Let the player keep playing after the win instead of ending the campaign.

319. [SETTLED] Situational encounter limit: When the player chooses the encounter team (items 164 and 169), the number of teammates allowed grows with the team reputation (item 170, 0–100) as specified in item 322, up to an absolute ceiling of eight. The sheriff is additional to the limit.
Rejected: 319-r-1. Site size and layout: Let the site's size decide the limit.
Rejected: 319-r-2. Case threat: Let the size of the hostile force decide the limit.
Rejected: 319-r-3. Posse comitatus: Let the sheriff swear in temporary townsmen for big cases.
Rejected: 319-r-4. No ceiling: Let the factors alone decide the limit.

320. [SETTLED] Road ambush: In a hostile travel encounter (item 105), every teammate traveling with the sheriff is in the scene, without team selection and regardless of the ceiling in item 319.
Rejected: 320-r-1. Ceiling limits travel: Let the ceiling also limit how many teammates travel together.
Rejected: 320-r-2. Rest join later: Start with teammates up to the ceiling and bring the rest in as reinforcements.

321. [SETTLED] Office size: The number of teammates in the office, excluding the sheriff, is capped by a limit that grows with the team reputation as specified in item 322.
Rejected: 321-r-1. Money only: Bound the office only through wages, loyalty, and reputation, without a cap.
Rejected: 321-r-2. Fixed cap: Keep a fixed office limit.

322. [SETTLED] Team limits by reputation: Use these limits, with the sheriff not counted. Team reputation 0–19: office 3, encounter 2. 20–39: office 5, encounter 3. 40–59: office 7, encounter 5. 60–79: office 9, encounter 6. 80–100: office 12, encounter 8. The largest road ambush under item 320 is therefore twelve teammates and the sheriff.
Rejected: 322-r-1. Moderate growth: Office 3, 4, 5, 6, 8 and encounter 2, 3, 4, 5, 6 across the same bands.
Rejected: 322-r-2. Earlier limits as the top: Office 2, 4, 5, 6, 8 and encounter 1, 2, 3, 3, 4 across the same bands.

323. [SETTLED] Reputation drop: When team reputation falls and the office holds more teammates than item 322 allows, teammates above the cap leave the office at once, least loyal first. Ties are broken by the implementation.
Rejected: 323-r-1. Keep all, no hiring: Dismiss nobody and block recruiting until the crew is below the new cap.
Rejected: 323-r-2. Player dismisses: Require the player to dismiss teammates down to the cap before the next journey.

324. [SETTLED] Who counts toward team limits: Every crew member except the sheriff counts toward the office cap and the encounter limit in item 322, whether a deputy or a hired hand, including hands hired for a single case.
Rejected: 324-r-1. Only deputies count: Apply the caps to deputies only and leave hired hands unlimited.
Rejected: 324-r-2. Case hands exempt: Exclude hands hired for a single case from the office cap.

325. [SETTLED] Unfit teammates in an ambush: Teammates traveling with the sheriff who cannot fight are present in a road ambush under item 320. They can be targeted by hostiles.
Rejected: 325-r-1. Not in the scene: Show only teammates able to fight.

326. [SETTLED] Main character creation: The deputy who becomes the sheriff is fully generated from the campaign seed, including name and portrait; the player does not shape them.
Rejected: 326-r-1. Name and portrait: Let the player name the deputy and assemble their portrait before the opening.
Rejected: 326-r-2. Name only: Let the player name the deputy and generate the portrait.

327. [SETTLED] Sound effect style: Menus, campaign screens, and the staged scenes in items 307 and 313–316 have sound effects. Like the illustrations in item 312, they are period sounds of wood, leather, paper, metal, coins, bells, horses, and gunfire rather than modern interface beeps. Spoken lines in staged scenes use the stylized pseudo-voice in item 40, never synthesized speech. Effects sit beneath the music in items 189, 262, and 309 without drowning it, and overlapping effects are limited so that bursts of input never become a din. The exact sounds and levels are implementation parameters.
Rejected: 327-r-1. Menus only: Give sound effects to menu controls and leave the staged scenes to music alone.
Rejected: 327-r-2. Leave unspecified: Keep sound effects an implementation detail documented only in the README.

328. [SETTLED] Menu and campaign cues: Give each kind of control action a distinct cue: hovering over a control, pressing it, switching a tab or page, opening and closing a dialog, and a dull knock for an action that is not possible. Give campaign events their own cues: a stamp for accepting a case or signing on a teammate, coins for payments and rewards, a telegraph key for news, hoofbeats on departure, a bell when a new day dawns, and short cues for wounds and victories.

329. [SETTLED] Staged scene cues: Accompany the staged scenes as follows. Swearing in (item 313): a bell and the badge being pinned on. Death (items 307 and 314): a single low toll for a crew member; three tolls for the sheriff, followed by a distinct cue for the star passing when someone takes up the star. Town arrival (item 314): hoofbeats and the sounds of the town. Discovered lead (item 314): a single recognizable lead cue (item 342). Duel (item 315): the challenge vignette plays over the duel tune in item 262; the standoff beat holds near silence, with only wind under that tune, until the draw and the shot; the outcome vignette tolls when someone died. Brawl (item 316): the opening card carries the swinging saloon doors and the crowd; the aftermath card carries coins when there are costs.

330. [SETTLED] Sound effect rules: Sound effects share the saved sound setting and mute control with the music. They start only after the first user gesture as browsers require, fall silent while the page is hidden, and fail silently when audio is unavailable without affecting play. Verify that each cue in items 328 and 329 plays at its moment, that muting silences effects and music together and persists, and that the game runs normally with audio blocked or unavailable. Also verify the items that refine these cues (items 331–342): the standoff keeps the quiet duel tune with wind, the oath and the duel challenge are voiced, the arrival sound grows with town size, repeated cues vary, the saloon carries its floor sounds, and every staged scene reads fully with sound off.

331. [SETTLED] Duel standoff sound: During the standoff beat, the duel tune keeps playing quietly with wind on top, as in item 329.
Rejected: 331-r-1. Music drops to silence: Fade the duel tune out, leaving only wind, a creaking sign, and a heartbeat until the draw.
Rejected: 331-r-2. Tune swells: Build the duel tune to a peak and cut it at the draw.

332. [SETTLED] Sound production: Synthesize sound effects in the browser without audio files, reproducibly.
Rejected: 332-r-1. Recorded samples: Play freely licensed recordings rendered to audio files.
Rejected: 332-r-2. Hybrid: Synthesize interface sounds and use recordings for gunfire, horses, bells, and crowds.

333. [SETTLED] Volume control: Music and effects share a single on/off sound setting, as in item 330.
Rejected: 333-r-1. Separate music and effects: Provide two volume controls plus the shared mute.
Rejected: 333-r-2. Full mixer: Provide separate controls for music, effects, and voice.

334. [SETTLED] Hover cue: Hovering over a control plays a very faint, rate-limited tick.
Rejected: 334-r-1. No hover sound: Play sounds only for presses and events.

335. [SETTLED] Voice in staged scenes: The oath in a swearing in and the challenge and reply at a duel's face-off are spoken in the pseudo-voice of item 40, alongside their text. Other staged scenes do not use the voice.
Rejected: 335-r-1. Brawl opening: Voice the shout that starts a brawl.
Rejected: 335-r-2. Death and endings: Voice a last word or an epitaph line in the death and ending scenes.

336. [SETTLED] Town arrival variety: The arrival sound grows with the town's size, from a few voices in a hamlet to a busy street in a city.
Rejected: 336-r-1. By town kind: Vary the sound with the kind of town, such as a mining camp, cattle town, rail town, or river town.
Rejected: 336-r-2. By time of day: Vary the sound with the time of day.
Rejected: 336-r-3. By weather: Vary the sound with the current weather.

337. [SETTLED] No ambient bed: Campaign screens carry only the menu theme and event cues; the town's sound belongs to the arrival vignette.
Rejected: 337-r-1. Quiet town bed: Play a faint ambience of the current town under the menu theme.
Rejected: 337-r-2. Replace music in town: Play town ambience instead of the menu theme while in a town.

338. [SETTLED] Ending and nemesis cues: The nemesis's death sounds as a single echoing shot fading into wind. The win ending opens with a short, warm brass and guitar phrase; the failure ending with the toll, then silence. Capturing an associate sounds as handcuffs clicking shut.
Rejected: 338-r-1. Reuse existing cues: Use the existing toll and victory cues without special sounds.
Rejected: 338-r-2. Music only: Score the endings with a special version of the menu theme and no effects.

339. [SETTLED] Repetition and placement: Each play of a cue varies slightly in pitch and timing so repeats never sound identical. Menu and vignette cues are centered, without stereo placement.
Rejected: 339-r-1. Vary and pan: Add stereo placement in vignettes, such as each duelist's shot from their side.
Rejected: 339-r-2. Identical, centered: Play every cue identically.

340. [SETTLED] Readable artwork without sound words: Staged scenes convey their narrative through the artwork and the minimal narrative text required by their storyboards, so they remain understandable with sound off. Audio cues do not require a written or decorative visual equivalent. Ordinary depicted actions, objects, expressions, and consequences may convey the event; do not add elements merely to transcribe a sound. No vignette displays sound words, onomatopoeia, written descriptions of audio cues, speech bubbles, comic effect lettering, or a subtitle bar. Keep the specified audio cues and voiced lines. This applies to full sequences and shortened repeated scenes.
Rejected: 340-r-1. Audio transcription: Add written descriptions of sounds to staged scenes.
Rejected: 340-r-2. Mandatory cue equivalents: Give every audio cue a visual counterpart, including written sound effects. Superseded by stripped-down artwork that conveys the narrative without transcribing audio.
Rejected: 340-r-3. None: Treat sound as decoration without visual counterparts.

341. [SETTLED] Saloon floor sounds: The playable saloon carries glasses at the bar, cards at the tables, the swinging doors, and murmur under its tune, at a constant level regardless of where the sheriff stands.
Rejected: 341-r-1. Placed sounds: Make each sound louder near its source in the room.
Rejected: 341-r-2. Tune only: Play only the piano tune and interaction cues.

342. [SETTLED] Lead cue: A newly discovered lead has one recognizable cue, whatever its source.
Rejected: 342-r-1. By source: Vary the cue with the lead's source, such as paper from a case, a whisper in a saloon, or a telegraph key on the road.

343. [SETTLED] Duel draw: In a duel, right-click starts drawing the revolver. The draw takes time; no mouse tracing gesture is required. After the draw the aim settles into the two-ring aim under items 344 and 347. Draw timing is an implementation parameter.
Rejected: 343-r-1. Sweep gesture: Pull the mouse down to grip and sweep up toward the opponent, with speed and cleanness setting the draw.
Rejected: 343-r-2. Hold and release: Hold the draw key and release it at the right moment to clear the holster.
Rejected: 343-r-3. Draw key alone: Draw with one key press, with draw time from skill, wounds, and the weapon alone, without the two-ring aim.
Rejected: 343-r-4. Connected dots: Draw by moving the mouse through a connected series of dots in order.

344. [SETTLED] Duel aim: After the draw, aim settles gradually into the two-ring aim in item 347. The outer ring jitters and moves with the sight-picture jitter; mouse movement controls the inner ring. Skill, wounds, fatigue, and intoxication (item 346) increase or reduce the sway.
Rejected: 344-r-1. Hip, then sights: Fire from the hip with a wide spread, or raise the revolver to eye level over time for a tighter aim.
Rejected: 344-r-2. Swinging arc: Swing the gun through the target in an arc and fire as it crosses.

345. [SETTLED] Single-action firing: The Colt Model 1873 is cocked during the draw. Each later shot needs a separate cocking action, which costs time and disturbs the aim. Fanning the hammer fires faster but very inaccurately. The controls are implementation parameters.
Rejected: 345-r-1. Cock, no fanning: Require cocking for each shot without allowing fanning.
Rejected: 345-r-2. Abstracted: Use no cocking action and let the fire-rate limit stand in for it.

346. [SETTLED] Intoxication effects: Drinking increases aim sway and slows reaction and the draw; makes movement unsteady in the saloon and brawls, with less pain but a weaker guard in fistfights; makes intimidation bolder but explanation worse in persuasion; and leaves a hangover the next morning that slows the character. Effects grow with the amount drunk and wear off over time. Exact magnitudes and durations are implementation parameters.
Rejected: 346-r-1. Nerve: Reduce fear so that the drinker is steadier under pressure but misses the opponent's tells more easily.

347. [SETTLED] Duel aim alignment: The aim shape has two rings. The outer ring moves and jitters with the sight picture; the player moves the inner ring with the mouse. When the inner ring is inside the outer ring, the shot is aligned and follows the ray trace. If the player fires while the rings are not aligned, the shot has an error related to their separation; the exact relationship is an implementation parameter. Show the aim shape at a fixed size, centered on the main duel view; the outer ring still moves and jitters within that display. This display is an explicit exception to the no-HUD rule in items 9 and 85, limited to duels.
Rejected: 347-r-8. Draw dots: Generate a seeded connected dot pattern and require the player to trace it; misses slow the draw and fumbles can snag or drop the gun.
Rejected: 347-r-1. Diegetic dots: Place the dots on the duelist's hand, holster, and arm path as part of the figure.
Rejected: 347-r-2. Hidden, learned: Show no dots and let the player learn the path by feel.
Rejected: 347-r-3. Per holster and hand: Set the pattern by holster type and draw hand.
Rejected: 347-r-4. Fixed pattern: Always use the same pattern.
Rejected: 347-r-5. Speed cap: Let skill set the fastest possible draw regardless of the trace.
Rejected: 347-r-6. Restart only: Restart the trace on a missed dot without other penalty.
Rejected: 347-r-7. Slower only: Let misses only slow the draw.

348. [SETTLED] Duel sight picture: During the exchange, show a small inset of the revolver's sights against the opponent, swaying with the aim under item 344. The two-ring aim under item 347 moves in correspondence with the sight-picture jitter. The inset and rings are explicit exceptions to the no-HUD rule in items 9 and 85, limited to duels.
Rejected: 348-r-1. Barrel line in world: Show the aim only through the drawn revolver's barrel and arm, with the focus blur of item 184.
Rejected: 348-r-2. Swaying crosshair: Show a crosshair during the exchange, swaying with the aim.

349. [SETTLED] Intoxication presentation: Show the player-controlled character's intoxication through screen effects that grow with drink, such as slight blur, double vision, and a slow sway of the view. Campaign screens state the condition, such as tipsy, drunk, or hungover, alongside wounds and fatigue.
Rejected: 349-r-1. Body language: Show intoxication through the character's sprite and portrait staggering and flushing.

350. [SETTLED] Crew drinking: On autonomous saloon visits (item 197), each teammate drinks according to temperament and drinking habit (item 351). Drunk teammates get into trouble more often. Teammates pay for their drinks from wages already earned, so the office pays nothing directly; a teammate whose wages are overdue drinks on credit and grows unhappy, which lowers loyalty. Intoxication and hangovers follow item 346 for every character alike, so a teammate who is still drunk or hungover carries the effects into departures and encounters.
Rejected: 350-r-2. Bonding: Let drinking with the sheriff build loyalty.
Rejected: 350-r-3. Office purse: Charge teammates' drinks to the office purse.
Rejected: 350-r-4. Sober after the visit: Limit a teammate's drinking to the saloon visit, without later effects or hangover.

351. [SETTLED] Drinking habits: Some characters are heavy drinkers by temperament. The sheriff cannot forbid drinking, but can choose or dismiss heavy drinkers.
Rejected: 351-r-1. Habits and a rule: Let the sheriff set a no-drinking rule that costs loyalty with drinkers.
Rejected: 351-r-2. Dependence: Let drinking grow into dependence, with withdrawal when deprived.
Rejected: 351-r-3. No habits: Let all characters drink alike.

352. [SETTLED] Transport: The party shares one kind of transport: horses, mules, a wagon, or travel on foot. Each kind sets travel speed, carrying capacity, and feed needs. Transport is bought at a town's livery, trading in the current animals. Travel encounters never injure or kill transport animals. Prices, speeds, and capacities are implementation parameters.
Rejected: 352-r-1. Animals at risk: Let travel encounters wound or kill the animals, leaving the party on foot.
Rejected: 352-r-2. Per-character horses: Give each character their own mount, which can be lost, with the party moving at its slowest member's pace.

353. [SETTLED] Duel hit reactions: Every hit visibly jolts the duelist's body in the bullet's direction, under item 84: an arm hit twists the shoulder, a chest or belly hit staggers the duelist back a step or doubles them over, a leg hit buckles the knee, and a head hit snaps the head. These involuntary movements are an exception to standing in place under item 212, and follow the realism rule in item 360.
Rejected: 353-r-1. Reaction in place: Play a recoil and flinch animation without moving the duelist's feet.

354. [SETTLED] Falling in a duel: A head, chest, belly, or leg hit of medium or greater severity always makes the duelist fall. A light torso or leg hit makes them fall by chance; an arm hit rarely does. Exact chances are implementation parameters.
Rejected: 354-r-1. Any torso or leg hit: Make every head, torso, or leg hit drop the duelist, and no arm hit.
Rejected: 354-r-2. Any hit: Make every hit drop the duelist.

355. [SETTLED] Shooting after a hit: A duelist who is hit but stays standing cannot fire until the stagger ends, and their aim is thrown far off and must settle again under item 344. Arm wounds also follow items 88 and 95.
Rejected: 355-r-1. Only aim thrown off: Let the duelist fire at once with the aim thrown off.

356. [SETTLED] Duel end on a fall: The exchange ends the moment a duelist falls to the ground, and the duelist left standing wins. The winner may still shoot the fallen duelist; witnesses and the law judge this under items 206 and 216. This revises item 214.
Rejected: 356-r-1. Fall ends, no finishing: Make shooting at a fallen duelist impossible.
Rejected: 356-r-2. Ends unless they fire on: Let a fallen duelist keep shooting from the ground if able.

357. [SETTLED] Final duel and a fall: The final duel continues until a duelist is dead. When the nemesis falls alive, the sheriff must finish them; walking away is not offered. When the sheriff falls alive, the nemesis shoots them dead, and succession follows item 278. This revises item 356 for the final duel only; finishing shots in the final duel carry no witness or legal judgment.
Rejected: 357-r-1. Sheriff chooses: Let the sheriff finish the nemesis or walk away, leaving the outcome to the wound rules and a later rematch.
Rejected: 357-r-2. Wound decides: Offer no finishing and let the wound rules decide whether the nemesis survives.
Rejected: 357-r-3. Nemesis leaves the sheriff: Leave a fallen sheriff to the wound rules, allowing a later duel.
Rejected: 357-r-4. Fight on from the ground: Let a fallen sheriff keep shooting in the final duel.

358. [SETTLED] Both duelists fall: When both duelists fall at the same moment, the duel is a draw. Each lives or dies by their wound, and witnesses judge as usual.
Rejected: 358-r-1. Later fall loses: Count the duelist who falls a split second later as the winner.

359. [SETTLED] Judging a finishing shot: In an ordinary duel, witnesses and the law judge a shot at a fallen duelist like an unprovoked shot that wounds under item 216: a fine and a reputation loss, more if it kills. Without witnesses there is no consequence.
Rejected: 359-r-1. Always murder: Treat it as murder, with a heavy fine and reputation loss and a sheriff losing the star.
Rejected: 359-r-2. Depends on threat: Treat it as lawful if the fallen duelist still raises a gun, otherwise as an unprovoked shot.

360. [SETTLED] Realistic hit reactions: A bullet's momentum barely moves a person, so keep the physical shove from a hit small; never knock someone back or down by the bullet's force alone. Make the body's own reaction longer and clearer instead: doubling over, clutching the wound, a stumble, a knee giving way, and a delayed collapse where the wound warrants it. Falls come from the wound's effects, as in items 75 and 354. This applies to every character in duels, fistfight gunfire, and tactical encounters, and refines items 84 and 353. Exact durations are implementation parameters. The [FBI's 1989 report on handgun wounding factors](https://ia800200.us.archive.org/16/items/fbi-handgun-wounding-factors-and-effectiveness/fbi-handgun-wounding-factors-and-effectiveness.pdf) states that a bullet cannot knock a person down; the shooter would receive an equal push.
Rejected: 360-r-1. Exaggerated for readability: Use a visibly larger shove backward in the style of Western films.
Rejected: 360-r-2. Keep as is: Keep the current short reactions outside duels.

361. [SETTLED] Weapon roster scope: The roster covers handguns (single- and double-action revolvers and pocket pistols), rifles and carbines (lever-action repeaters and single-shot rifles), and shotguns. The knife takedown in item 295 remains, but knives and explosives are not roster weapons.
Rejected: 361-r-1. Blades and explosives: Include carried knives such as the Bowie knife and dynamite as roster weapons.

362. [SETTLED] Historical cutoff: The roster contains only models made or sold by the campaign's in-period date in 1881.
Rejected: 362-r-1. 1880s decade: Allow models introduced up to 1889.

363. [SETTLED] Roster size: Curate about fifteen to twenty well-documented, commonly carried models. Each model must be historically authentic and distinguishable from the others in both appearance and gameplay.
Rejected: 363-r-1. As complete as sources allow: Include every documented model and variant.
Rejected: 363-r-2. Small roster: Include one or two models per category.

364. [SETTLED] Weapon differences: Give every weapon model its own visually distinguishable in-game pixel sprite, depicting the model's historically authentic form and identifying details. Weapons also have authentic, distinguishable gameplay characteristics, including caliber and penetration under the wound and material rules; action and loading, such as single or double action, lever or single shot, and loading gate or break-top; accuracy and effective range from barrel length and sights; and weight, which affects draw speed, aim settling, sway, and fatigue. Model differences must be grounded in historical evidence rather than invented solely to distinguish weapons. Exact values are implementation parameters grounded in period sources.

365. [SETTLED] Weapon acquisition and distribution: Stores stock weapons according to the town's size and region, with larger towns carrying more models. Hostiles, gunslingers, and associates carry weapons that fit their role and region, such as a coach gun for a stagecoach guard. Weapons cannot be sold or traded in.
Rejected: 365-r-1. Sell and trade: Let weapons be sold or traded in at stores.

366. [SETTLED] Scavenged weapons: Weapons picked up from the fallen under item 54 can be used during the encounter but are handed over to the law afterward; the character's own weapons return. Scavenged ammunition is unaffected.
Rejected: 366-r-1. Kept: Let picked-up weapons stay with the character within the carry limits.

367. [SETTLED] Carry limits: A character carries one long gun (a rifle, carbine, or shotgun), up to two handguns, and one hidden pocket pistol. Further long guns stay with the transport or in the office.
Rejected: 367-r-1. By weight: Allow any mix up to a weight limit, with heavy loads slowing movement and adding fatigue.
Rejected: 367-r-2. Two long guns: Allow a rifle and a shotgun at once, plus two handguns.

368. [SETTLED] Ammunition: Each cartridge is its own type, such as .45 Colt, .44-40, .45-70, and 12-gauge buckshot or birdshot. A cartridge shared between models, such as .44-40 in a rifle and a revolver, is interchangeable. Ammunition is bought by the box.
Rejected: 368-r-1. Simplified classes: Use only pistol, rifle, and shotgun ammunition.

369. [SETTLED] Weapon condition: Period cartridges occasionally misfire, and clearing a misfire costs time. Weapons do not wear and need no cleaning.
Rejected: 369-r-1. Wear and maintenance: Let weapons degrade with use and weather and need cleaning or repair.
Rejected: 369-r-2. Always reliable: Exclude misfires and wear.

370. [SETTLED] Roster list: The spec does not name the models. Implementation research selects them under items 361–364, documents sources for each model's availability by 1881, appearance, and gameplay characteristics, and records the list in the implementation notes. Verify each model has a historically authentic, distinguishable sprite and distinguishable, evidence-grounded gameplay characteristics.
Rejected: 370-r-1. Named draft: Name a draft list of twenty models in the spec.

371. [SETTLED] Storyboard scope: Specify a storyboard for every staged scene: the opening (item 271), every swearing in (item 313), deaths (items 307 and 314), town arrivals and discovered leads (item 314), duels (item 315), brawls (item 316), and the endings (item 304). These apply throughout the game.
Rejected: 371-r-1. Story scenes only: Storyboard the opening, the final duel, the succession, and the endings; give the frequent scenes only a rule for repeats.
Rejected: 371-r-2. No storyboards: Keep the staged scenes at the level of items 313–316 and leave their composition to implementation.

372. [SETTLED] Storyboard location: The storyboards are numbered items of this specification.
Rejected: 372-r-1. Separate document: Keep the storyboards in a design document beside the specification, referenced by one item.

373. [SETTLED] Panel sequences: Every staged scene in item 371 is a sequence of illustrated panels, each showing one beat, rather than a single card. The cards of items 307 and 316 become such sequences. The standoff beat of item 315 is not a panel sequence; it stays in the duel view under item 385.
Rejected: 373-r-1. Single richer card: Keep one card per scene, with exact art, text, and cue placement.

374. [SETTLED] Panel content: Each panel in items 378, 380–384, and 386–392 is defined by its setting, the cast shown by assembled portrait (item 311), its caption content, and its cues. Apply item 340: the artwork conveys the narrative without transcribing audio, and captions never describe a sound. Captions use the campaign's generated names, traits, places, and dates, and show only what the office knows (item 273). Portraits show current wounds. Identify every portrayed character by name, and include the nemesis's traits (item 300), integrated into the scene under item 396; identification text is distinct in content from the panel's narrative caption, without requiring a separate label or a position beneath a portrait. Panel presentation follows item 312. Pacing, repeats, layout, and caption wording follow items 394–397; panel durations and art details are implementation parameters.

375. [SETTLED] Storyboard order: The panel order in items 378, 380–384, and 386–392 is normative and supersedes item 307's delegation of order to implementation. Item 307's wording and timing remain implementation parameters.

376. [SETTLED] Storyboard limits: No storyboard shows the nemesis hidden, shadowed, or as a silhouette (item 300), explains the murder motive (item 276), stages an associate's capture or questioning (item 314), interrupts the brawl itself (item 316), zooms in on portraits during the standoff (item 315), or ends with a summary screen (item 304). Only the oath and the duel challenge and reply are voiced (item 335).

377. [SETTLED] Scene chaining: When staged scenes follow one another, play them in one unbroken order and sound each cue once. Final duel won: the duel outcome (item 386) leads into the win ending (item 391). The sheriff killed in any duel: the duel outcome leads into the sheriff's death (item 390), then the succession swearing in (item 380) or the failure ending (item 392). A crew member killed in a duel: the duel outcome leads into the crew death (item 389). When a death follows a duel outcome, the death's tolls replace the outcome toll of item 329. A lead found on arrival plays after the town arrival.

378. [SETTLED] Opening storyboard: Panel 1, The window: the deputy on the boardwalk outside the office; through the office window, the muzzle flash as the nemesis shoots the murdered sheriff; the deputy's portrait; caption: the deputy's name, the town's name, and the date. The shot accompanies the muzzle flash in the window. Panel 2, The glimpse: the nemesis bursting out of the office, mounting, and riding off; the nemesis's likeness, with name and traits integrated into the scene; caption: the nemesis's name and traits, riding away, where nobody knows. Hoofbeats accompany the ride through the dust. Panel 3, The office: the murdered sheriff slumped back in the chair behind the desk; their portrait marked fallen; caption: the murdered sheriff's name, shot dead; the motive stays uncertain. A single toll accompanies the scene. Panel 4, The star: a close-up of the murdered sheriff's star; caption: the deputy takes up the star. Panel 5, The face: the deputy's face, determined, the star pinned on; the deputy's portrait; caption: the new sheriff rides alone, with a horse and the starting funds, after the nemesis. The pinning, shown as the badge glinting.
Rejected: 378-r-1. The street: Five panels in the street: the empty street, the nemesis facing the murdered sheriff, the shot, the deputy watching from the boardwalk, and the nemesis riding out.
Rejected: 378-r-2. Deputy's eyes in the street: Four panels opening on the deputy: the deputy, the nemesis facing the murdered sheriff, the shot, and the nemesis riding out.
Rejected: 378-r-3. Shot first: The shot in an empty street, the fallen sheriff, the nemesis revealed, the deputy watching, and the ride out.
Rejected: 378-r-4. Heard only: The deputy hears the shot without seeing it, glimpses the nemesis, and finds the body, amending item 265.
Rejected: 378-r-5. Wanted poster: The glimpse shows only the face; the name and traits come from a wanted poster on the desk.

379. [SETTLED] No opening oath: The opening has no separate swearing in. The deputy takes up the star in panels 4 and 5 of item 378, without an oath or the bell. This amends item 313.
Rejected: 379-r-1. Self-sworn: After the opening, three panels: the star in the deputy's hand, the oath voiced with the bell, and the deputy pinning the star on themselves.
Rejected: 379-r-2. Town judge: A town judge reads the oath and pins the star.
Rejected: 379-r-3. At the grave: The oath is sworn at the murdered sheriff's fresh grave, the star on the marker.
Rejected: 379-r-4. Oath inside the opening: The opening ends at the office, followed by the star, the oath, and the deputy's face with the star pinned on.

380. [SETTLED] Succession swearing in: Panel 1, The oath: the successor's portrait, one hand raised; caption: the oath text, voiced. A bell, shown swinging. Panel 2, The badge: the star pinned on the successor; caption: the successor's name, now sheriff. The pinning, shown as the badge glinting. Panel 3, The vow: the successor before the portraits of the murdered sheriff and every sheriff of the campaign who has fallen, marked in memory; caption: the successor vows revenge for all who wore the star. Panel 4, The trail: the nemesis's portrait beside the final location; caption: the successor knows where the nemesis waits (item 285). When the final location is not fixed, the caption names the last lead instead.
Rejected: 380-r-1. Three panels: Oath, badge, and trail, with the fallen sheriff shown in memory at the oath.
Rejected: 380-r-2. Compact: Oath and badge in one panel, then the trail.

381. [SETTLED] New deputy swearing in: Panel 1, The oath: the boardwalk outside the office, townsfolk watching; the sheriff's and the new deputy's portraits, the deputy's hand raised; caption: the oath text, voiced. A bell, shown swinging. Panel 2, The badge: the sheriff pins the star on the new deputy before the townsfolk; caption: the deputy's name, joining the office. The pinning, shown as the badge glinting.
Rejected: 381-r-1. In the office: The same two panels inside the office, without onlookers.
Rejected: 381-r-2. Welcome: A third panel shows the crew welcoming the new deputy.

382. [SETTLED] Town arrival storyboard: Panel 1, The approach: the party riding in, the town on the horizon; caption: the town's name, the day and time, and its population, from the 1880 census where known and otherwise its size. Hoofbeats accompany the approach. Panel 2, The street: the town's street with a crowd that grows with the town's size (item 336); no caption. The town's sound, shown as the crowd in the street.
Rejected: 382-r-1. Uncertainty note: The caption names the town with its uncertainty note where it has one.
Rejected: 382-r-2. Sign, then street: The first panel shows the town's sign at the roadside.
Rejected: 382-r-3. Heads turn: Townsfolk look up as the party rides in, then the horses are hitched at the rail.

383. [SETTLED] Lead storyboard: Panel 1, The source: the place the word came from: a settled case's papers, a saloon table, a traveler on the road, or a dead associate's body, belongings, or witnesses. A questioned associate is shown by portrait only, without a questioning scene; caption: the source. Panel 2, The word: the portrait of the nemesis or the associate the lead names, beside a map fragment marking the named place; caption: what was learned and the date it was true (item 287). The lead cue (item 342) accompanies the discovery; the map marks the learned place.
Rejected: 383-r-1. Journal panel: A third panel shows the lead inked into the journal.
Rejected: 383-r-2. Wanted poster: The word shows as a wanted poster with the place written across it.

384. [SETTLED] Duel challenge storyboard: Panel 1, The challenge: the challenger's portrait, with onlookers behind; caption: the challenge, voiced. Panel 2, The reply: the challenged duelist's portrait; caption: the reply, voiced. Any persuasion offered under item 202 follows this panel; the later panels play only when the duel goes ahead. Panel 3, The walk out: both duelists push out through the saloon doors, the room emptying after them; no caption. The doors sound as they swing. This panel plays only when the challenge is made inside a saloon. Panel 4, The face-off: both portraits facing each other across the ground chosen for the duel, onlookers between; no caption, since the stakes are plain. The duel tune of item 262 plays from panel 1. This applies to saloon challenges, spectated duels, teammate duels, the title's Quick duel, and the final duel. In the final duel the sheriff challenges the nemesis, the crew are the onlookers (item 302), and no persuasion is offered.
Rejected: 384-r-1. Three panels with stakes: Challenge, reply, and a face-off whose caption states the stakes.
Rejected: 384-r-2. The quarrel: A first panel shows what started the quarrel.

385. [SETTLED] Standoff beat: After the face-off, the duel view holds the two duelists in place before the draw. The tune plays quietly with wind (item 331), shown as dust blowing across the ground. No panel, caption, or portrait appears.
Rejected: 385-r-1. Onlookers scatter: Onlookers back away and a shutter closes during the standoff.

386. [SETTLED] Duel outcome storyboard: Panel 1, The smoke: the victor standing behind the gunsmoke drifting from his shot over the ground, the fallen in the dust; the fallen's portrait marked fallen; no caption. A toll sounds when someone died. Panel 2, The victor: the victor's portrait with wounds; caption: any judgment under item 359. Panel 3, The fallen: played only when someone died; the dead duelist's portrait marked dead; caption: their name, dead. When a death scene (items 389 and 390) or the win ending (item 391) follows under item 377, panel 3 is left out, since that scene shows the fallen. A draw (item 358) shows both duelists fallen in panel 1, and both portraits marked fallen take the place of panel 2. In the final duel won, panel 1 carries the nemesis's death cue (item 338) instead of the toll, and panel 3 shows the nemesis's portrait marked dead.
Rejected: 386-r-1. Three panels always: Smoke, the victor, and the fallen, whether or not anyone died.
Rejected: 386-r-2. Hat in the dust: Smoke, the fallen's hat in the dust, and the victor holstering the revolver.

387. [SETTLED] Brawl opening storyboard: Panel 1, The glass: a glass smashing on the floor, heads turning, the doors swinging, a crowd gathering; no caption. The doors and crowd cues accompany the scene. Panel 2, The fighters: the fighters' portraits on their two sides, the one who started it marked; caption: who started it. The fight follows unchanged.
Rejected: 387-r-1. The doors: The first panel shows the doors swinging and a crowd gathering, captioned with the saloon's name.
Rejected: 387-r-2. First punch: A third panel shows the instigator's first swing.

388. [SETTLED] Brawl aftermath storyboard: Panel 1, The room: the wrecked saloon, chairs overturned, the injured among them; the injured's portraits with their wounds; caption: each injury. Panel 2, The bill: the barkeep holding out the bill, coins on the bar; caption: damages, fines, and other costs. The coins cue accompanies the payment. Panel 2 is left out when there are no costs.
Rejected: 388-r-1. Three panels: The room, the injuries, and coins on the bar, each a panel of its own.

389. [SETTLED] Crew death storyboard: Panel 1, The fallen: the crew member's portrait marked fallen with their wounds; caption: their name, where and how they died. A single low toll accompanies the scene. Panel 2, Hats off: the surviving crew around the grave, hats in hand, the marker bearing the name and date; the surviving crew's portraits; no caption. When the sheriff dies in the same event, crew death storyboards are skipped and only the sheriff's death (item 390) plays.
Rejected: 389-r-1. Fallen and grave: The second panel shows the marker with the survivors beside it, captioned with who remains.
Rejected: 389-r-2. Hats off in three panels: The fallen, the crew around the open grave, and the marker as a panel of its own.
Rejected: 389-r-3. Hat on marker: The fallen, then the marker with their hat hung on it.

390. [SETTLED] Sheriff death storyboard: Panel 1, The fallen: the sheriff's portrait marked fallen with their wounds, darker than for a crew member; caption: the sheriff's name, where and how they died. Three tolls accompany the scene. Panel 2, Hats off: the crew around the grave, hats in hand, the marker bearing the name and date; the crew's portraits; no caption. Panel 3, The star: with a successor, the star on the marker, lifted; no caption; the star passing, shown as the star glinting as it is lifted, and the succession swearing in (item 380) follows. Without a successor, the crew leave the grave, the star left on the marker; no caption and no star cue; the failure ending (item 392) follows. When the sheriff dies with no crew, panel 2 shows the marker alone, with wind shown as blowing dust and no portraits, panel 3 is left out, and the failure ending follows.
Rejected: 390-r-1. Fallen, grave, star: The second panel shows the marker captioned with those at the grave, and the third names who takes up the star.
Rejected: 390-r-2. Star in the dust: Two panels: the sheriff fallen with the star in the dust beside them, then a hand lifting it.
Rejected: 390-r-3. Undertaker and townsfolk: With no crew, the undertaker and a few townsfolk stand at the grave, hats in hand.
Rejected: 390-r-4. The horse: With no crew, only the sheriff's horse stands by the grave, then wanders off.

391. [SETTLED] Win ending storyboard: Panel 1, The reckoning: the nemesis dead in the dust; the nemesis's portrait marked dead; no caption. The brass and guitar phrase (item 338), shown as the sun breaking over the scene. Panel 2, The old grave: the sheriff at the murdered sheriff's grave in the town of the opening, hat in hand; the sheriff's portrait with wounds and the murdered sheriff's portrait in memory; no caption. Panel 3, The star laid down: the sheriff leaves the star on the grave; no caption. Panel 4, The last ride: the sheriff riding out of town; caption: the end. The game returns to the title.
Rejected: 391-r-1. Grave, office, ride: The nemesis's grave at sunrise, the office with the crew and the fallen in memory captioned as avenged, and the last ride.
Rejected: 391-r-2. Sunset only: The nemesis dead, then the sheriff and crew riding into the sunset.
Rejected: 391-r-3. Three panels: The reckoning, the old grave, and the last ride, without laying down the star.

392. [SETTLED] Failure ending storyboard: Panel 1, The desk: the old sheriff's office desk standing abandoned, the chair empty and the lamp cold; no caption. The toll, then silence (item 338), accompanies the empty office. Panel 2, The poster: the nemesis's wanted poster peeling off a wall in the wind; the nemesis's portrait with name; caption: "[name] is still at large. Nobody will come looking for him." The game returns to the title.
Rejected: 392-r-1. Empty office: Three panels: the grave, the star on an empty desk, and the nemesis at large.
Rejected: 392-r-2. He rides on: The grave, then the nemesis riding on along an empty road.

393. [SETTLED] Storyboard acceptance: Verify that every staged scene in item 371 plays as a panel sequence in the order of items 378, 380–384, and 386–392; that each panel shows its cast by assembled portrait with current wounds and the campaign's names, places, and dates; that each panel forms one integrated scene, with every portrait, caption, identification, and short text incorporated into its composition rather than presented as an overlaid UI element under item 396; that every cue sounds at its panel and each scene remains narratively understandable with sound off, without sound words, audio descriptions, speech bubbles, or comic effect lettering under item 340; that the final duel, crew death, and sheriff death chain under item 377 and sound each toll once; that the standoff beat shows no panel; that captions expose no undiscovered information; that nothing in item 376 appears; and that pacing, skipping, repeats, and layout follow items 394–396, including every repeated scene using its exact prescribed vignette in item 395 with all required information and cues, with a skipped scene committing the same state as a watched one. Use reproducible, seeded scenarios.

394. [SETTLED] Panel pacing: Each panel waits for the player for up to 10 seconds and then moves on by itself. A Next control, or its key, moves to the next panel sooner; a click on the panel itself does not. Escape skips to the next panel that offers a choice or to the end of the current scene. In a chain under item 377, skipping ends only the current scene. A skipped scene commits the same state as a watched one, as in item 200. A panel that offers a choice, such as persuasion under item 384, waits for the player and is never skipped past; a choice a teammate answers on his own is answered on Next or after the same 10 seconds. The last panel of each scene waits for the player to continue. Skipping stops any cue or voiced line still playing.
Rejected: 394-r-1. Click on the panel: A click anywhere on the panel moves to the next panel.
Rejected: 394-r-2. Story scenes unskippable: Panels advance on their own, and the opening, the succession, and the endings cannot be skipped.
Rejected: 394-r-3. Hold-based advance: Panels advance on their own after a hold that varies with the panel, a click or key press hurries, and a Skip control jumps ahead. Superseded by the user's direction: a fixed 10-second wait and a Next control.

395. [SETTLED] Repeated scenes: The first occurrence in a campaign of each frequent scene plays in full. Every later occurrence uses exactly the single vignette prescribed below for that scene type; selection is not delegated to implementation. Each is one integrated scene under item 396, with identities, current wounds, and all required short text composed into it. These shortened compositions replace the full sequence only on repetitions; item 375 still governs full sequences. Preserve every required cue and voiced line under items 313–316, 329, and 335, with no sound words or audio transcriptions under item 340 and no undiscovered information. The exact shortened vignettes are:

- Town arrival — The approach (item 382, panel 1): the party rides toward the town on the horizon, with its street and inhabitants visible at the entrance. The crowd reflects town size. Integrate the town's name, day and time, and known 1880 census population or otherwise its size. Play the hoofbeats and the town's sound, depicting hoofbeats and town activity in the same scene.
- Discovered lead — The word (item 383, panel 2): a map fragment with the newly learned place marked, the named nemesis or associate depicted in a likeness on the map's accompanying papers, and the source represented in the same composition. A case lead uses case papers; a saloon lead places the map on the saloon table; a road lead shows the traveler presenting the map on the road; a lead recovered from a dead associate shows the map with the body, belongings, or witnesses from which it was obtained. A questioned associate is represented only by a likeness among the papers, without staging questioning. Integrate the source, what was learned, and the date it was true. Play the lead cue; the map mark conveys the discovered place without an exclamatory discovery label.
- New deputy swearing in — The badge (item 381, panel 2): on the boardwalk outside the office, the sheriff pins the star on the new deputy, whose hand remains raised for the oath, with townsfolk watching and the bell visible. Integrate the deputy's name, joining the office, and the oath text. Voice the oath, sound the bell and pinning cue, and show the swinging bell and glinting badge.
- Ordinary duel challenge — The challenge (item 384, panel 1), expanded to include the reply: at the actual place of the challenge, both duelists confront each other amid watching onlookers. Integrate their challenge and reply into this confrontation and voice both lines; play the duel tune. Any persuasion choice is offered on this vignette after the reply, before agreement to fight. Do not depict a walk out or a later face-off as already having happened before that choice. If the duel goes ahead, proceed directly to item 385's standoff in the duel view.
- Ordinary duel outcome — The smoke (item 386, panel 1): gunsmoke over the actual duel ground, the fallen in the dust and the standing survivor in the same scene, both showing their wounds. In a draw, both lie fallen; do not depict a victor. Integrate their identities, fallen or dead status as applicable, and any judgment under item 359. Sound and depict the toll only when someone died, preserving item 377's replacement by a following death scene's tolls.
- Brawl opening — The glass (item 387, panel 1): the glass shatters on the saloon floor between the opposing fighters as heads turn, the doors swing, and the crowd gathers. Both sides are recognizable within the scene; integrate who started the brawl and identify the instigator in that confrontation. Play the doors and crowd cues; the artwork shows the swinging doors and shards. The playable fight follows unchanged.
- Brawl aftermath — The room (item 388, panel 1): the wrecked saloon with overturned chairs and the injured among them, their wounds visible. Integrate each injury. When there are costs, the barkeep holds out the itemized bill within this same room, with coins on the bar; integrate damages, fines, and other costs, and sound the coins cue. With no costs, omit the bill, coins, and coins cue.
- Crew death — Hats off (item 389, panel 2): the surviving crew stand around the grave, hats in hand, with the marker bearing the fallen member's name and date and a memorial likeness of that member at the marker. The likeness preserves their identity and wounds; integrate where and how they died and their death status into the memorial composition. Sound the single low toll without depicting it as text. Preserve item 377's chaining and do not also sound a preceding duel outcome toll.

The opening, the swearing in of a successor, the sheriff's death, the final duel, and the endings always play in full, as does the title's Quick duel.
Rejected: 395-r-3. Previous repeat-panel list: Reuse The street for town arrival, The face-off for duel challenge, The victor for duel outcome, The fighters for brawl opening, and The fallen for crew death. These selections are superseded by the exact compositions above.
Rejected: 395-r-4. Implementation-selected dramatic beat: Let implementation choose the most memorable panel for each occurrence, with examples rather than an exact prescribed vignette for each scene type.
Rejected: 395-r-1. Full every time: Every scene plays all its panels on every occurrence.
Rejected: 395-r-2. Player setting: A setting chooses between full and short frequent scenes.

396. [SETTLED] Panel layout: Vignettes are stripped-down artworks, composed with restraint and minimal required narrative text. Exclude comic-strip presentation, speech bubbles, sound words, effect lettering, and decorative annotations of sound or movement. Each panel fills the frame on its own and replaces the previous one. Each panel is one integrated scene: every portrait and any short text, including captions, names, traits, oath or dialogue text, and outcome markings, must belong to the scene's composition rather than appear as overlaid UI elements. Characters may be shown directly in the action or through scene elements such as a wanted poster, framed likeness, or memorial; text may be composed into the illustration or carried by scene elements such as a sign, letter, map, bill, or grave marker. These are examples, not required techniques or drawing styles. Storyboard references to portraits, labels, captions, cards, or elements beside one another specify content and relationships within this integrated scene, not separate portrait tiles, floating labels, caption bars, or UI cards over background art. This rule applies to full sequences and repeated key panels under item 395. Playback and choice controls remain governed by items 384 and 394. Transitions are implementation parameters.
Rejected: 396-r-2. Scene with UI overlays: Present portraits or short text as separate UI elements over a background illustration.
Rejected: 396-r-1. Dime-novel strip: Panels appear one after another side by side, filling a page like a comic strip.

397. [SETTLED] Caption wording: The storyboards specify what each caption tells; the literal wording is an implementation parameter.
Rejected: 397-r-1. Literal templates: Fix each caption's text in this specification as a template with slots for generated names, places, and dates.

398. [SETTLED] Tactical AI scope: The tactical AI items specify the autonomous behavior of hostiles, teammates, and civilians in every tactical scene: breaches, outdoor case encounters, and road ambushes (items 105 and 320). Duel opponents, brawl fighters, and saloon patrons follow their own items. Rules about "the sheriff" mean whoever holds the star (item 297).
Rejected: 398-r-1. All AI: Also cover duel opponents, brawl fighters, and saloon patrons.

399. [SETTLED] Normative AI rules: These items state behavior as rules: what a character perceives, decides, and does, and in which order. Timings, ranges, chances, and thresholds are implementation parameters unless an item fixes them. The implementation and its notes inspire these items but do not decide them. Settled items on the deputy, civilians, hostiles, skills (item 171), and drink (items 346 and 350) stay in force and are referenced, not restated.
Rejected: 399-r-1. Rules plus key numbers: Fix the defining numbers, such as the shortest delay before a first shot, in the specification.

400. [SETTLED] AI reaction chain: Before an AI character's first shot at a perceived target, it goes through noticing, startle, turning, raising its weapon, and deciding, with each step taking time. Reaction takes longer when the character is unaware, the target is far away or at the edge of its view, or the character is less experienced. There is a shortest delay before any first shot. Losing sight briefly restarts the reaction, and changing targets has a time cost.
Rejected: 400-r-1. Single reaction delay: Use one reaction delay determined by experience and awareness instead of the reaction chain.

401. [SETTLED] Shared tactical rules and AI head aim: AI characters follow the sheriff's rules of perception, movement, weapons, and wounds. Veterans whose aim has settled may deliberately aim for the head, as in the sheriff's high aim (item 87).
Rejected: 401-r-1. No AI head aim: No AI character ever deliberately aims for the head.
Rejected: 401-r-2. Head aim for all AI: Any AI character with settled aim may deliberately aim for the head.

402. [SETTLED] Starting awareness outside breaches: Road ambushers start wary and move toward the party; hostiles in outdoor case encounters start unaware. Breach hostiles start unaware under item 43.
Rejected: 402-r-1. Prepared volley: Ambushers start hidden in prepared positions and open with a volley.
Rejected: 402-r-2. Already engaged: Ambushers start aware and engaged.

403. [SETTLED] Hostile alert stages: A faint sound makes an unaware hostile suspicious: it turns, waits, then investigates. An alarm, such as a shot, forced door, broken window, shout, or cry, startles it and sends it to search the spot. A nearby door or loud footsteps also startle an unaware hostile like an alarm. After an alarm search, it stays on guard at the searched spot. Faint sounds do not pull it away from an alarm. Seeing a lawman makes it engage and shout a warning once.
Rejected: 403-r-1. Return to post: After searching, the hostile returns to its post while staying wary.
Rejected: 403-r-2. No additional nearby alarms: A nearby door or loud footsteps do not startle an unaware hostile like an alarm.

404. [SETTLED] Hit hostiles: A hostile hit while still able to fight crouches and returns fire from the hip for a short time. A shaken hostile, with low nerve or badly hurt, runs to nearby cover and holds fire until reaching it.
Rejected: 404-r-1. Cover after every hit: Every hit hostile seeks cover before firing again.
Rejected: 404-r-2. Fight in place: Hit hostiles keep fighting where they stand, with only their aim spoiled.

405. [SETTLED] AI weapon handling: AI characters favor a long gun beyond short range and a handgun close in, treating shotguns as long guns. In a fight, they switch to another loaded gun rather than reload, and top up during lulls. Items 429–431 specify emergency reloading, misfires, and scavenging. A disarmed hostile fetches a loose gun only where, by its best available estimate under item 424, no lawman sees it; otherwise it seeks cover while falling back under item 431. It never fires unarmed.
Rejected: 405-r-1. Range-specific guns and cover reloads: Prefer shotguns at close range and rifles at long range, and reload from cover.

406. [SETTLED] Broken hostiles: When a hit breaks a hostile's will, it stops firing and runs upright to cover out of the lawmen's sight, then goes to ground and watches. It makes no plea merely because of this break, remains a live hostile, and fights again when the break ends, unless it surrenders under the applicable wanted-target or associate rules in items 492 and 291.
Rejected: 406-r-1. Fight back on approach: The hostile also fights again before the break ends if a lawman comes close.
Rejected: 406-r-2. Out for the scene: The hostile stays out of the fight for the rest of the scene while still counting as live.

407. [SETTLED] Hostile cooperation: Hostiles call out what they see and converge on it, subject to their ability to hear and perceive communications.
Rejected: 407-r-1. No explicit cooperation: Hostiles cooperate only by hearing one another's shouts and shots, without calling out what they see and converging on it.
Rejected: 407-r-2. Coordinated veteran tactics: Veterans also flank by other routes and fire from windows while others hold the lawmen's attention.

408. [SETTLED] Hostile cover on engagement: Experience affects whether an engaged hostile takes cover. Nerve and the threat's direction affect its choice of cover.
Rejected: 408-r-1. Cover only after a hit: Engaged hostiles fight where they stand and seek cover only after a hit.
Rejected: 408-r-2. Cover for every hostile: Every engaged hostile takes cover.
Rejected: 408-r-3. Experienced hostiles only: Only experienced hostiles take cover on engagement.

409. [SETTLED] Near misses: A bullet passing close rattles the aim of anyone it passes and can drive characters with low nerve into cover.
Rejected: 409-r-1. No effect: A near miss has no effect.
Rejected: 409-r-2. Aim only: Near misses rattle aim but do not drive low-nerve characters into cover.

410. [SETTLED] Fallen hostile companions: A hostile who sees a companion fall turns toward the likely shooter and becomes alert.
Rejected: 410-r-1. No reaction: Hostiles ignore fallen companions.
Rejected: 410-r-2. Rescue a companion: A hostile may also drag a fallen companion into cover when it is safe to do so.

411. [SETTLED] Fighting teammate rules: Every fighting teammate, whether a sworn deputy or a hired hand under item 324, uses the same deputy rules, including items 77, 93, and 294.
Rejected: 411-r-1. Less disciplined hired hands: Hired hands follow orders less often, fire and retreat sooner, and do not carry the sheriff.
Rejected: 411-r-2. No orders for hired hands: Hired hands take no orders.

412. [SETTLED] Tactical zone map: The sheriff and fighting teammates use the same tactical model of the area divided into friendly, cleared, and hostile zones, with each teammate maintaining its own map under item 414. Initially the area occupied by the sheriff and friendlies is friendly; everything else is hostile. A zone may become friendly by being guarded and covered, or cleared by inspection and passage, under items 415, 432, and 452.

413. [SETTLED] Zone-based tactical commands: Cover me accompanies the sheriff while covering hostile approaches from friendly zones under item 446. Hold here defends the friendly zone nearest each receiving teammate on its own map, choosing a usable post covering hostile approaches; the mouse pointer does not select a different area. Push advances through successive eligible hostile zones and clears them under items 433 and 452. Fall back retreats into friendly or cleared ground farther from the boundary, covering hostile zones during the retreat and choosing a post farthest from known threats and hostile zones; refuse it when the friendly area has no depth. These commands remain advisory under item 37 and persist under items 426 and 433 until replaced or cancelled on identifying the sheriff down under item 479. Apply the perceived-information, blocked-route, and lost-contact rules throughout. A teammate under Hold or Fall back fights from its post rather than leaving it to chase or seek cover by a fallen sheriff, subject to the independent rescue and withdrawal judgments in items 419–420.
Rejected: 413-r-1. Fall back always accepted: Retreat within the current zone when no deeper friendly or cleared ground exists.
Rejected: 413-r-2. Pointed area: Defend the mouse-pointed area from a nearby post instead of the nearest friendly zone.

414. [SETTLED] Individual tactical maps: Each teammate maintains its own mental map based on what it perceives and communicates; zone knowledge is not automatically shared. Keeping sight contact with friendlies, or voice contact when the sheriff uses loud commands, is fundamental to coordinating these maps. The existing visibility, hearing, and communication rules apply.
Rejected: 414-r-1. Automatic shared map: The team automatically shares zone status without communication.

415. [SETTLED] Zone layout and security: The exact zone layout is an implementation choice. A zone is secure and friendly when a friendly is stationed there and covers adjacent hostile zones. It becomes hostile when a hostile is stationed there and covers adjacent friendly zones. An unguarded, inspected zone may instead be cleared under item 452. Loss of coverage and occupation by both sides follow items 432 and 452. The initial classification in item 412 applies at the start of the scene.
Rejected: 415-r-1. Fixed physical zones: Require the zones to follow physical spaces such as rooms and outdoor areas.
Rejected: 415-r-2. Dynamic zones required: Require zones to be dynamic areas around the team.
Rejected: 415-r-3. Clearance alone: Mark a zone friendly when the team has checked it and found no active threat, without requiring a friendly to be stationed and covering adjacent hostile zones.

416. [SETTLED] Teammate initiative: A teammate never opens fire first on an unaware hostile. It searches for hostiles during a Push or after identifying the sheriff down under item 479. In Cover it accompanies the sheriff and checks uncleared openings when things are quiet under item 446, without initiating an independent search for hostiles. If it loses contact with the sheriff, it searches to regain that contact under item 446. When it identifies the sheriff down, it cancels standing orders and may autonomously search or Push toward the encounter objective under item 479. When the sheriff merely cannot communicate and has not been identified down, apply item 434.
Rejected: 416-r-1. No unasked checks: The teammate does not check uncleared openings while following.
Rejected: 416-r-2. Take the lead: The teammate also takes the lead in clearing when the sheriff waits for a long time.

417. [SETTLED] Teammate signals and call-outs: A teammate silently points out an unaware hostile the sheriff cannot see. It makes a spoken contact call when weapons are free under item 435, which hostiles can hear under item 73. It also calls for a downed sheriff, calls contact while carrying, and answers orders.
Rejected: 417-r-1. No unprompted spoken contact call: Use the silent pointing gesture without a spoken contact call when weapons are free.
Rejected: 417-r-2. Whisper then shout: Whisper contact when close to the sheriff and shout only once fighting starts.

418. [SETTLED] Passing teammates: Lawmen physically block one another. They steer around each other and step aside when in the way, subject to collision with the environment and other characters under item 71.
Rejected: 418-r-1. Pass except on stairs: Lawmen pass through one another everywhere except on a stair flight.
Rejected: 418-r-2. Pass in narrow passages: Lawmen pass through one another only in doorways and on stairs.

419. [SETTLED] Teammate carry judgment: A teammate considers carrying the sheriff out only when the sheriff is failing or crippled and it estimates that more than one hostile remains under item 424. It waits for a quiet spell, looks around, and requires a route it estimates to be safe; it calls off the carry on contact. Calling off this transient rescue does not cancel a persistent command under item 426. The sheriff may resist while still able to act under item 64.
Rejected: 419-r-1. High danger: Also consider a carry when the sheriff is hurt but fighting and the danger is high.
Rejected: 419-r-2. Loyalty affects carry: Make a teammate more willing to carry the more loyal it is.

420. [SETTLED] Teammate retreat judgment: A teammate withdraws when hurt or out of ammunition under fire unless very steady, or when the sheriff is dead and the teammate estimates that it is outnumbered under item 424 and has low nerve. Greater loyalty makes the teammate hold longer. Apply the persistent-order and competing-goal rules in items 425–426: contact or injury alone does not interrupt an order, while this item's explicit independent withdrawal judgment remains available. A withdrawal alone does not fail the breach under item 21. For this judgment, hostile fire or a hit counts as being under fire; the lawmen's own guns do not.
Rejected: 420-r-1. Loyalty has no effect: Use the same retreat conditions without loyalty making a teammate hold longer.
Rejected: 420-r-2. Hold while sheriff fights: Never withdraw while the sheriff still fights; otherwise withdraw only when hurt or out of ammunition.

421. [SETTLED] Several fighting teammates: Teammates avoid posts within a body's width of the sheriff or another known lawman, and avoid spots held by a senior teammate. A pushing teammate prefers a zone that no senior teammate in sight is already pushing into, and does not push into a zone whose clearing it has perceived. Only one teammate carries the sheriff. An order reaches every teammate who perceives it. Teammates divide roles, such as covering the sheriff and covering approaches, coordinating by sight under item 413 and using their own maps under item 414.
Rejected: 421-r-1. Nearest recipient only: An order reaches only the nearest teammate who perceives it.
Rejected: 421-r-2. No role division: Teammates do not divide roles such as covering and following.

422. [SETTLED] Civilian response to danger: A civilian chooses based on the situation: flee when an exit is near and away from the shooting; otherwise hide. A civilian may also freeze with hands raised when an armed person is close. If an attempted exit makes no progress for a few seconds, abandon that exit and reassess; hide when no usable exit remains. The exact no-progress interval is a tuning parameter.
Rejected: 422-r-1. Fixed tendency: Give each civilian a fixed tendency to flee through the nearest open exit or hide, with hiding only when there is no exit.
Rejected: 422-r-2. No freezing: Use the situational choice between fleeing and hiding without freezing with hands raised.

423. [SETTLED] Unfit teammates in tactical scenes: A teammate who cannot fight but can walk first moves to the nearest cover away from the shooting, then falls back to safe ground. A teammate unable to walk remains where it is under item 438.
Rejected: 423-r-1. Stay in place: The unfit teammate crouches where it is.
Rejected: 423-r-2. Direct withdrawal: The unfit teammate heads directly for safe ground instead of first moving to cover.

424. [SETTLED] Best available tactical estimates: Characters act on their best available estimate despite uncertainty. Estimate remaining hostile numbers, whether outnumbered, watched scavenging routes, and safe destinations from personal observations and perceivable reports under items 401 and 414. Never consult unseen encounter state to obtain these facts. Reports remain usable under item 440.
Rejected: 424-r-1. Conservative uncertainty: Always act conservatively when relevant information is missing.
Rejected: 424-r-2. Split uncertainty policy: Require conservative estimates for rescue and withdrawal routes while using best estimates for engagement and scavenging.

425. [SETTLED] Task commitment and situational judgment: Carrying out the current task takes precedence while the character remains capable, except for a morale break, mandatory wound response, or identifying the sheriff down under item 479. Within these constraints, select among competing permitted goals using perceived danger, nerve, and loyalty, retaining the explicit independent rescue and withdrawal judgments in items 419–420. Physical inability and involuntary wound effects always constrain available actions. A broken hostile's flight under item 406 takes precedence over its voluntary return fire under item 404. Contact or injury alone does not interrupt a persistent order under item 426; identifying the sheriff down cancels standing orders under item 479. Evaluate physical capability and involuntary wound effects, then update perceived observations and communications before selecting permitted tasks and actions; this does not prescribe an implementation architecture or think interval.
Rejected: 425-r-1. Self-preservation first: Self-preservation always takes precedence over orders and rescue.
Rejected: 425-r-2. Task commitment alone: Apply task precedence without situational selection among other permitted goals.
Rejected: 425-r-3. Situational selection alone: Choose freely among goals without the default commitment to the current task.

426. [SETTLED] Persistent orders and transient actions: A newly perceived order overrides the previous order. A teammate immediately cancels its standing orders on identifying the sheriff down under item 479. Contact and injury do not cancel or suspend a given order; continue carrying it out within the character's physical capabilities and the explicit judgment rules in item 425. Retain persistent orders while reassessing transient actions such as scavenging and rescue. Calling off a carry under item 419 does not itself remove the order that preceded it. Switching, reloading, misfire clearing, entries, stairs, and carrying retain their ordinary physical constraints and time costs. Interrupted action progress and handling of the carried sheriff follow item 441.
Rejected: 426-r-1. Abandon everything: Discard the task and choose afresh whenever an action is interrupted.
Rejected: 426-r-2. Resume everything: Automatically suspend and resume transient actions as well as persistent orders.
Rejected: 426-r-3. Contact or injury cancels orders: Cancel or suspend a given order merely because contact or injury occurs.

427. [SETTLED] Approach-dependent lost contact: After losing an engaged target, a character in Hold watches its last observed position. In Push it approaches the last observed position and expands its search. In Fall Back it retreats while watching the last observed position. New perceived sounds accumulate as additional potentially hostile positions to be watched rather than replacing the existing positions. Shared perception, reaction costs, and item 403's alert priorities remain in force; teammates search for hostiles during Push or after identifying the sheriff down under item 416. Push progression follows item 433. Approach modes derive from current behavior under item 442, and watched positions are removed under items 443 and 445.
Rejected: 427-r-1. Uniform hold: Every character holds the last observed position regardless of approach.
Rejected: 427-r-2. Uniform bounded search: Every character approaches, searches locally, and then guards regardless of approach.
Rejected: 427-r-3. Uniform expanding search: Every character expands its search regardless of approach.

428. [SETTLED] Immediate-threat targeting: Prioritize the most immediate perceived threat. If the shot at that threat is obstructed or unusable, consider the next threat in priority order. A known ally in the firing line, including an ally standing just behind the target, makes a shot unsuitable under item 77; do not keep selecting an incapacitated character as an active threat solely because it remains alive. Target changes retain the reaction cost in item 400. If no threat offers a usable shot, do not fire merely to satisfy target selection; continue the applicable task and lost-contact behavior.
Rejected: 428-r-1. Target persistence first: Retain the current target until lost or no longer threatening even when another threat is more immediate.
Rejected: 428-r-2. Nearest first: Prefer the nearest target with a usable shot rather than the most immediate threat.

429. [SETTLED] Emergency reloading: When all usable carried guns are empty but compatible ammunition remains, reload at the current position if moving would be more dangerous; otherwise seek cover and reload. Do not wait indefinitely for a lull while unable to fire. Unavailable cover and blocked movement follow item 436. Preserve wound limitations and the weapon's actual reload sequence.
Rejected: 429-r-1. Always seek cover first: Require reaching cover before reloading under continuing threat.
Rejected: 429-r-2. Break contact first: Require breaking contact before reloading.

430. [SETTLED] Misfire judgment: Choose between switching guns and clearing a misfire according to exposure and the time each action needs. If clearing is impossible, switch to another usable loaded gun when available. If no such gun is available, apply emergency reloading, scavenging, and fallback rules according to the remaining capabilities; never pretend the fault was cleared. Preserve both switching and clearing time costs under items 369 and 405.
Rejected: 430-r-1. Always switch first: Prefer another loaded gun regardless of exposure and action duration even when clearing is possible.
Rejected: 430-r-2. Always clear first: Clear the misfire immediately whenever physically possible.

431. [SETTLED] Exhaustion-driven scavenging and fallback: Seek weapons or compatible ammunition from the fallen only when no carried weapon can be made ready with available ammunition. A disarmed hostile retains item 405's restriction on fetching a gun where a lawman is estimated to see it. When nothing usable can be obtained, fall back, subject to physical capability and item 436. Falling back is movement away from the threat, not automatic completed extraction under item 437. Remaining unarmed does not itself count as incapacitation, death, or surrender; a hostile remains a live hostile.
Rejected: 431-r-1. Proactive replenishment: Scavenge during safe lulls before carried supplies are exhausted.
Rejected: 431-r-2. Opportunistic replenishment: Replenish under threat before exhaustion whenever the perceived benefit justifies the risk.
Rejected: 431-r-3. Remain indefinitely: Hold indefinitely without falling back when neither a usable weapon nor supplies can be obtained.

432. [SETTLED] Loss and contest of zone security: When a friendly guard leaves or required coverage is lost, the zone ceases to be friendly. If it has been cleared and no hostile has been seen in it since, it is cleared; otherwise it is hostile, subject to the mixed-occupation rule. When both sides occupy it, classify it by which side controls the relevant approaches; an unresolved contest is hostile. These transitions supplement items 415 and 452 and retain item 412's initial classification. Each teammate updates its own map from perceived evidence and reports, so an unobserved change does not instantly update every map. If no adjacent hostile zone remains, there is no hostile boundary to cover; this alone does not make a guarded friendly zone hostile.
Rejected: 432-r-1. Retained security: Retain the zone's security after its friendly guard or required coverage is lost until hostile recapture.
Rejected: 432-r-2. Any mixed occupation is hostile: Treat occupation by both sides as hostile even when friendlies control the relevant approaches.

433. [SETTLED] Command persistence and progression: Commands persist until replaced by a newly perceived command or cancelled on identifying the sheriff down under items 426 and 479. Push advances into and secures a selected hostile zone, then continues through eligible zones along its depth-first trail under items 413 and 478. Continue through successive zones as part of the same order, rather than returning to following the sheriff after one zone. Cover me, Hold here, and Fall back persist at and after reaching their immediate positions rather than expiring on arrival. Cover me follows the advancing sheriff and updates its covering position under item 446; Hold here retains its defended zone. When the command cannot supply a usable action, including when no eligible zone exists, classifications prevent further progress, or required support is unavailable, fall back to Hold and secure unless other circumstances override under item 425. This fallback does not discard the retained command. A teammate engaged with a hostile may pursue that target as part of Push while watching other believed positions. After a shot or a firing step, it fights from where it stands for a few seconds before advancing; the order is delayed, not cancelled. Use the last observed position and perceivable reports when the target is out of sight. Pursuit continues through successive eligible zones after the current zone is cleared.
Rejected: 433-r-1. Push then hold: Secure one selected hostile zone and then hold as Push's normal completion behavior.
Rejected: 433-r-2. Follow the sheriff after one zone: Secure one selected hostile zone, then return to following the sheriff without beginning another advance. This was the prior main item's interpretation of following and is superseded by the user's clarification.
Rejected: 433-r-3. Expiring commands: End Cover me, Hold here, or Fall back merely because its immediate destination or purpose has been reached.
Rejected: 433-r-4. Fixed post throughout contact: Require a teammate under Push to remain at its post throughout contact and defer all pursuit until contact ends.

434. [SETTLED] Continuation without sheriff commands: If the sheriff cannot communicate but has not been identified down, teammates may continue a previously received Push but may not initiate a new one. Otherwise they hold and react, subject to independent judgment, withdrawal, and Cover's search for a missing sheriff under item 446. An unseen hostile does not reveal its location. Once a teammate identifies the sheriff down, it immediately cancels its standing orders and acts autonomously toward the encounter objective under item 479. Each teammate uses its own perception and perceivable reports; there is no automatic team-wide notification.
Rejected: 434-r-1. Autonomous Push while the sheriff is not known down: Initiate a new Push merely because the sheriff cannot communicate, before identifying the sheriff down.
Rejected: 434-r-2. Automatic withdrawal: Always attempt withdrawal when the sheriff cannot command.
Rejected: 434-r-3. Retain orders after the sheriff is down: Keep prior orders or merely hold and react after identifying the sheriff down instead of independently pursuing the encounter objective.

435. [SETTLED] Local weapons-free condition: A teammate enters weapons free when it perceives active fighting involving any friendly. The condition lasts until it detects no immediate hostile signs. Evaluate this from its own perception and perceivable reports, without automatically sharing a scene-wide state. Weapons free permits the spoken contact calls in item 417; it does not remove item 416's prohibition on opening fire first on an unaware hostile. Exact immediacy thresholds are implementation parameters.
Rejected: 435-r-1. Sheriff only: Trigger weapons free only on perceiving the sheriff firing or being attacked.
Rejected: 435-r-2. Per-target permission: Treat weapons free only as a separate condition for each aware and engaged hostile.
Rejected: 435-r-3. Whole-scene latch: Keep weapons free active for the rest of the scene after immediate hostile signs disappear.

436. [SETTLED] Blocked goals and usable entries: Wait for a temporary obstruction to clear, but abandon the immediate goal when the route is persistently blocked. Abandoning an immediate destination does not itself cancel a persistent order: apply the Hold-and-secure fallback in item 433 unless other circumstances override under item 425. AI may open and climb usable entries under ordinary physical rules, but may not force an entry because of the noise. Closed or bolted barriers are not bypassed without a permitted action. Apply this to searching, cover seeking, following, commands, rescue, withdrawal, and civilian flight. Preserve solid collision, yielding behavior, and wound limitations; do not attempt a route judged suicidal merely to satisfy a goal. A civilian whose flight goal is blocked reassesses hiding or freezing under item 422. Precise waits and pathfinding are implementation parameters.
Rejected: 436-r-1. Alternative-destination policy first: Immediately try other destinations and then hold instead of waiting for a temporary obstruction.
Rejected: 436-r-2. Immediate abandonment: Abandon the goal whenever no suitable route is currently available, including temporary blockage.
Rejected: 436-r-3. Force entries: Permit AI to force doors or windows to complete its goal.

437. [SETTLED] Physical extraction: Complete a withdrawal, or a carry of the sheriff to safety, only on reaching a usable physical extraction boundary. The tactical Fall back command and local fallback movements do not by themselves remove a character from the scene. If extraction remains blocked, apply item 436 without granting an outcome transition at an arbitrary safe-looking position. Retain item 21's remaining-friendlies rule and the existing failure when the sheriff is carried to safety while hostiles remain; apply campaign time, resource, wound, and death consequences under items 131 and 173. An extracted teammate stays out for the remaining encounter under item 444.
Rejected: 437-r-1. Safety transition: Complete extraction through an outcome transition after reaching a position merely judged safe outside the immediate fight.

438. [SETTLED] Walking required for unfit withdrawal: Only unfit teammates able to walk execute item 423's cover-then-withdraw sequence. Those unable to walk remain where they are. If a teammate loses the ability to walk during withdrawal, its movement stops at its current position; do not grant crawling or movement to an incapacitated character. This does not add rescue of teammates other than the sheriff.
Rejected: 438-r-1. Crawl to safety: Permit an unfit teammate unable to walk to execute the withdrawal by crawling when its wounds permit.

439. [SETTLED] Tactical AI completeness acceptance: Require reproducible encounter scenarios for each resolved Tactical AI rule and its interactions. Cover competing orders, injury and rescue; persistent orders surviving ordinary contact and injury but ending immediately when the sheriff is identified down; lost contact under Hold, Push, and Fall Back with accumulated sound positions and several threats; empty guns under uninterrupted pressure; misfires and inaccessible supplies; exhausted scavenging followed by fallback; vacated and contested zones; Push continuing through successive zones without reverting to following the sheriff; persistent and impossible commands; a sheriff identified down with an unseen remaining hostile, after each standing order and with no prior order, requiring autonomous objective-directed judgment using perceived information; local weapons-free onset and end; blocked stairs and exits; opening and climbing without forced entries; interrupted carries; civilian flight becoming unsafe; physical extraction; and immobile teammates. Include several teammates and the maximum supported road-ambush team under item 322. A deliberate standoff can be valid when independent tactical judgment warrants it; acceptance requires neither guaranteed victory nor forced termination of every encounter. Also verify initial and moving Cover without independent hostile search; a teammate who loses the sheriff searching outward from the last perceived position and regaining contact using only perceived information, including a blocked route and an unseen moving sheriff; Hold selecting the nearest friendly zone regardless of pointer position; Push pursuit continuing after clearing a zone; depth-first continuation along its own trail, backtracking to an eligible branch, the bound near an active sheriff and its removal after identifying the sheriff down; swept-zone transitions; and distinct teammate maps updated only by perception or reports. Exercise indoor, outdoor case, and road-ambush scenes, including cross-floor sight and movement. Check shared perception, reactions, weapons, wounds, hostile behavior, communication, team collision, rescue, civilians, and campaign outcomes, as well as combinations of these rules. Test observable actions and results rather than a prescribed algorithm.
Rejected: 439-r-1. Broad checks only: Rely on existing broad encounter acceptance items without requiring reproducible scenarios for each resolved rule and its interactions.

440. [SETTLED] Reports persist until contradicted or checked: Keep tactical reports usable until contradicted by perceived evidence or checked under item 445. Their reliability does not decrease solely with elapsed time. Use them as part of the best available estimate under item 424, without granting access to actual unseen state.
Rejected: 440-r-1. Report aging: Make an old report less reliable merely because time has passed.

441. [SETTLED] Completed physical steps and stopped carries: When a transient physical action must stop, retain physically completed steps and continue from them if that action is later attempted and remains feasible. Do not undo completed shots, loaded cartridges, opened barriers, or actual movement, and do not automatically resume an unsuitable transient task. This does not change item 426's order persistence. When a carry is called off, resisted, or interrupted by the carrier becoming unable to carry, put the sheriff down at the current physically valid position under the ordinary wound and collision rules; do not continue toward a safer destination before putting the sheriff down.
Rejected: 441-r-1. Restart unfinished action progress: Discard progress that could physically be retained and restart the action if later attempted.
Rejected: 441-r-2. Move before setting down: Continue to nearby safer ground before putting the sheriff down when the carrier remains capable.

442. [SETTLED] Behavior-derived approach modes: Use Cover for accompanying and covering the sheriff, Hold for defending a post, Push for investigation or advance, and Fall Back for retreat. There is no separate Following mode: accompanying the sheriff is part of Cover under item 446. For item 427's lost-contact behavior, Cover watches hostile positions as Hold does even while repositioning to support the sheriff; such movement does not become Push or permit an independent search for hostiles. Cover searches for the sheriff after losing contact under item 446. Apply Hold, Push, and Fall Back lost-contact rules to autonomous behavior as appropriate, including hostiles. Existing restrictions on teammate searches and new Pushes in items 416 and 434, and hostile alert rules in item 403, remain in force.
Rejected: 442-r-1. Independent persistent mode: Give autonomous characters a separately maintained approach mode chosen through tactical judgment rather than deriving it from their current behavior.

443. [SETTLED] Evidence-based watched-position removal: Retain a potentially hostile position accumulated under item 427 until personal observation or a perceivable report establishes that it is clear. A position does not expire merely through time or lack of fresh supporting evidence, and a newer sound does not replace older positions. Remove a position once sufficiently checked or reported clear under item 445. Update only the character's own knowledge unless a communication is perceived. Weapons free continues to use item 435's immediate-hostile-signs condition.
Rejected: 443-r-1. Expiry without evidence: Remove a potentially hostile position after a time without supporting evidence.
Rejected: 443-r-2. Retain cleared entries for the scene: Keep a checked position recorded for the rest of the scene, marked clear and no longer an immediate threat, instead of removing it from the watched-position set.

444. [SETTLED] No rejoining after extraction: A teammate who completes extraction under item 437 remains out for the rest of that encounter. It may not return through an entry even if still physically capable. Apply the existing remaining-friendlies and encounter-outcome rules; extraction does not restore a dead or incapacitated character.
Rejected: 444-r-1. Re-entry permitted: Allow an extracted teammate to return through a usable physical entry when capable and its judgment permits.

445. [SETTLED] Visual check of a potentially hostile position: An unobstructed visual inspection of the indicated position, long enough for ordinary target recognition, is sufficient to check it under items 440 and 443. If no active hostile is recognized there, that particular suspicion can be cleared; recognizing a hostile confirms the threat instead. An obstructed or unseen indicated position has not been visually checked. Inspecting surrounding plausible hiding places is not required to clear this indicated position and does not follow automatically from the check. A perceivable clear report can convey the result of the same check under the existing communication rules, without granting sight or knowledge of other hidden space. Checking this position is distinct from making or keeping a whole zone friendly under items 415 and 432. Exact observation timings and spatial tolerances remain implementation parameters.
Rejected: 445-r-1. Surrounding hiding-place inspection: Require inspecting both the indicated position and its surrounding plausible hiding places before clearing the position.
Rejected: 445-r-2. Variable inspection footprint: Require an inspection area determined by the original report's uncertainty and available concealment rather than accepting a visual check of the indicated position.

446. [SETTLED] Initial Cover and covering an advance: Cover is the initial behavior of a fighting teammate before an accepted command replaces it. Accompany the sheriff, maintaining visual contact when circumstances permit, avoiding obstruction, checking uncleared openings, and observing and engaging threats under the existing perception, stealth, and reaction rules. When Cover me is obeyed, continue covering the sheriff as the sheriff advances by following and repositioning among friendly zones to maintain useful coverage of hostile approaches under item 413. Following is movement within Cover, not a separate mode or the expiry or replacement of the Cover me command; no repeat command is required merely because the sheriff moves. When contact with the sheriff is lost, attempt to reestablish it by searching outward from the sheriff's last perceived position, using subsequent personal observations and perceivable communications rather than an unseen current position. This search is part of Cover and does not authorize an independent search for hostiles or a new Push. Apply blocked-route and independent-judgment rules in items 425 and 436. A sound from the sheriff can indicate a position but does not establish that a sheriff already seen down or dead has recovered. Explicit Hold here, Push, or Fall back replaces initial Cover and is not overridden merely because the sheriff moves. On identifying the sheriff down, cancel Cover and all other standing orders immediately and use independent judgment under item 479.
Rejected: 446-r-1. Separate Follow mode: Introduce a distinct approach mode with its own movement, perception, and lost-contact rules instead of using the existing modes.
Rejected: 446-r-2. Eliminate following behavior: Remove following as an identifiable behavior and express all accompanying through other zone behaviors.
Rejected: 446-r-3. Fixed Cover me post: Keep covering from the same original position when the sheriff advances instead of maintaining cover by following and repositioning.
Rejected: 446-r-4. Unordered investigation: Allow a teammate in Cover to leave it and search for a suspected hostile without Push.
Rejected: 446-r-5. No outward search: Attempt to regain contact without searching outward from the sheriff's last perceived position.

448. [SETTLED] Draw-last bonus: In player-controlled duels, give the player a small, brief time-warp slowdown bonus for drawing after the opponent. This is a benefit for the human player, not an AI advantage in spectated duels. Eligibility and activation follow item 450, and the affected simulation clocks follow item 451. Exact slowdown strength, duration, and transition curves are implementation and playtesting parameters. The effect gives additional time to react or aim; normal ammunition, aim alignment, wounds, and duel outcomes still apply. This applies to the final duel under item 302.
Rejected: 448-r-1. No draw-last benefit: Keep ordinary duel timing without a time-warp reward for drawing after the opponent.
Rejected: 448-r-2. Accuracy or damage bonus instead: Reward drawing last solely through increased accuracy or damage rather than the requested slowdown.

449. [SETTLED] Draw-last acceptance: Verify item 448 in reproducible player-controlled ordinary and final duels, using the trigger and affected clocks in items 450–451. Check eligible and ineligible draw order, simultaneous draw events, bluffs without an actual draw, no activation before the player starts drawing, no retrigger on later cocking or firing, the effect's start and end, return to ordinary time, responsive mouse aiming while the opponent slows and the player's clock stays at real speed, and normal wound and outcome resolution. Verify that spectated AI duels receive no player bonus and that the effect does not persist into menus or the next duel. These acceptance requirements do not claim that implementation has passed them.

450. [SETTLED] Draw-last activation: When the player starts drawing under item 343, grant item 448's slowdown only if the opponent has already started its actual draw. Compare draw-start events, not when either gun finishes clearing its holster. A bluff or movement toward the holster is not an actual draw. Equal draw-start times do not qualify as drawing last; event ordering must make simultaneous inputs unambiguous. The bonus applies to the opening draw and does not retrigger on later cocking or firing.
Rejected: 450-r-1. Slowdown before the player draws: Start the slowdown immediately when the opponent starts drawing while the player has not yet started, giving extra reaction time before the player commits to a draw.

451. [SETTLED] Opponent time warp: During item 448's bonus, slow the opponent's whole duel clock: its draw and aim progression, hammer and weapon actions, reloads, wound progression and decisions. The player's own clock and the mouse input run at real speed; the player's draw, aim settling and shots are not slowed, so the benefit is a real relative speed advantage for the player over the opponent. Responsive input does not bypass the player's simulated draw, cocking, or other action time. Preserve ordinary hit, wound, and outcome rules; end the effect after a bounded duration and restore the opponent's ordinary speed when it ends or the duel ends. The slowdown is stronger and lasts longer the better the sheriff's skill, and weaker with fatigue, intoxication, a hangover, and wounds, so a skilled sheriff gains a large lead and a poor one a small one. The effect is also heard: while it runs, the duel music and sound effects play slowed and lower in pitch and muffled, and they return to normal when it ends, in a menu, or when the duel ends. Exact slowdown factor, duration, and transition curves remain implementation and playtesting parameters.
Rejected: 451-r-1. Whole-duel slowdown: Slow both duelists, the projectiles and wounds equally while only mouse input stays real, giving the player extra real time but no relative action-speed advantage.

452. [SETTLED] Cleared zones and the front line: A zone is recorded as swept on a teammate's own map (item 414) when a friendly has been in it and looked over most of it with no known hostile in it, whatever that friendly's order: holding or covering it and passing through it clear it alike, as does finishing a Push's securing of it under item 433. While a friendly is stationed there and covers the approaches, the zone is friendly under item 415. When the guard leaves or required coverage is lost, the swept zone is classified as cleared rather than hostile, unless a hostile has been seen in it since the sweep; a hostile seen in a cleared zone makes it hostile. A cleared zone is neither friendly nor hostile. It counts as safe ground: Push neither selects one as its next zone nor treats one as an obstacle, and an adjacent cleared zone is not a hostile approach that coverage must watch. Push works the front line through hostile zones connected to friendly or cleared ground. Select and revisit routes by the depth-first trail and backtracking rules in item 478, rather than by global nearest-zone ranking. This refines item 432; friendliness itself still requires a stationed friendly.
Rejected: 452-r-1. Cleared means friendly: Mark a swept zone friendly after the guard has left, as in 415-r-3 and 432-r-1.
Rejected: 452-r-2. Swept zones revert to hostile: Return a swept zone to hostile as soon as the guard leaves, so Push circles through zones it has already cleared.

461. [SETTLED] Release direction: The final increment makes Western Showdown a fully flow-oriented, engaging experience with RPG elements and fully realized extensions to its existing fundamental systems, aiming for a varied and compelling playthrough. The specific progression, flow, rewards, and system extensions are established through the decision boundary.

462. [SETTLED] Progression areas: The sheriff and crew develop through skills, traits, and reputation. The existing skill, trait, and reputation requirements remain in force unless explicitly revised by subsequent decisions.

463. [SETTLED] Visible, intelligible skills: Show the sheriff's and crew's skills and their improvements in a way the player can understand, including skill information for candidates during hiring and improvements in mission results when applicable. Identify what each displayed skill represents and which character improved, so the information supports recruitment and makes progress intelligible. This replaces the silent-improvement requirement in items 153, 171, 174, and 177. Verify the hiring and mission-result presentations, including a result with no skill improvement.
Rejected: 463-r-1. Silent improvement: Apply skill gains without showing them to the player.

464. [SETTLED] Skill categories: The sheriff and crew have three general skill classifiers: Precision, Toughness, and Awareness. Their effects are specified in items 465–467.

465. [SETTLED] Precision effects: Higher Precision improves aim stability and settling, making accurate shots more attainable, and improves weapon-handling speed, including switching, cycling, and reloading, subject to the existing movement, weapon, wound, and duel rules. It does not guarantee a hit or change projectile damage.
Rejected: 465-r-1. Aim only: Improve aim stability and settling without also improving weapon-handling speed.

466. [SETTLED] Toughness effects: Higher Toughness improves resistance to fatigue and steadiness under danger, affecting the existing fatigue and nerve-driven responses. It does not add health or negate a wound's physical effects.
Rejected: 466-r-1. Endurance only: Toughness affects fatigue and endurance; nerve and danger responses remain separate traits.

467. [SETTLED] Awareness effects: Higher Awareness helps autonomous teammates notice and recognize perceivable threats and react through the existing reaction chain. For the player-controlled sheriff, it strengthens the draw-last bonus and automatically avoids some road ambushes. After an automatic avoidance, report what happened; the party loses some time avoiding danger, then continues its journey, with ordinary elapsed-time consequences under item 173. It does not reveal unseen actors, bypass obstruction, impose a recognition delay on the player-controlled sheriff, or improve the sheriff's directional sound cues. The existing ability to avoid or withdraw when circumstances permit remains in force.
Rejected: 467-r-1. Clearer sound cues: Improve the sheriff's directional sound cues as Awareness increases.
Rejected: 467-r-2. Autonomous benefit only: Give the player-controlled sheriff no Awareness benefit.
Rejected: 467-r-3. Duels only: Give the sheriff an Awareness benefit in duels but not campaign danger.
Rejected: 467-r-4. Campaign only: Give the sheriff an Awareness benefit in campaign danger but not duels.
Rejected: 467-r-5. Detection choice only: Use Awareness only to give the player an early choice about whether to avoid an ambush.
Rejected: 467-r-6. Avoidance attempt only: Use Awareness only to improve an attempted avoidance.
Rejected: 467-r-7. Detection and attempted avoidance: Use Awareness for both an early detection choice and an attempted avoidance rather than automatic avoidance.
Rejected: 467-r-8. No delay: Continue an automatically avoided ambush without losing time.
Rejected: 467-r-9. Required detour: Always take a detour with its associated travel and supply costs after an automatic avoidance.
Rejected: 467-r-10. Variable avoidance consequences: Make the kind of consequence vary with circumstances instead of using the time delay.

468. [SETTLED] Acquired behavioral traits: Traits are acquired behaviors that influence situational choices and break ties between otherwise viable actions, rather than directly granting tactical advantages. The initial catalogue includes drinking, gambling, looking for trouble, buying favorite guns, defending others, aggression, receptiveness, loyalty, generosity, protectiveness, resentment, and self-interest. Depending on the trait, characters acquire it through repeated behavior or a significant event, and it is permanent once earned. For the player-controlled sheriff, traits record behavior and affect how others respond while the player retains all choices. Define precise triggers and behavioral effects through implementation and playtesting under item 475. Existing temperament and drinking rules remain in force; the loyalty trait does not replace the existing loyalty system.
Rejected: 468-r-1. Fixed traits only: Give characters only traits fixed when generated.
Rejected: 468-r-2. All traits evolve: Allow generated personality traits themselves to change through experience.
Rejected: 468-r-3. Temporary traits only: Treat traits solely as temporary conditions tied to recent events and recovery.
Rejected: 468-r-4. Fixed and acquired trait categories: Require both fixed personality traits and acquired experience-based traits as the release trait model.
Rejected: 468-r-5. Reversible acquired traits: Allow acquired traits to be lost or overcome after they are earned.
Rejected: 468-r-6. Mechanical tactical bonuses: Treat acquired behavioral traits as direct tactical advantages.
Rejected: 468-r-7. Repeated behavior only: Require repetition for every trait, including traits suited to a significant event.
Rejected: 468-r-8. Significant events only: Require a significant event for every trait.
Rejected: 468-r-9. Repetition accelerated by events: Require repeated behavior even when significant events can accelerate acquisition.
Rejected: 468-r-10. Trait-driven sheriff choices: Let traits change the player's available choices or decide the sheriff's actions automatically.
Rejected: 468-r-11. Named behaviors only: Restrict the initial catalogue to the seven named behaviors without related social or loyalty behaviors.
Rejected: 468-r-12. Broad initial catalogue: Require a broad initial catalogue beyond the named and related behaviors.
Rejected: 468-r-13. Small initial subset: Start with only a subset of the named behaviors and introduce the others later.
Rejected: 468-r-14. Narrower social set: Add only loyalty, generosity, and protectiveness to the original behaviors.
Rejected: 468-r-15. Broader social set: Require a broader initial set covering loyalty, generosity, grudges, trust, and sociability.
Rejected: 468-r-16. Implementation-selected social set: Leave the additional social and loyalty traits entirely to implementation and playtesting.

469. [SETTLED] Reputation consequences: Extend individual and team reputation beyond the existing effects on work and team limits so it also affects recruitment, willingness to negotiate, pay, and how people respond. Case success or abandonment changes team reputation; a person's notable conduct changes their individual reputation when it is witnessed or publicly known. Case difficulty and the severity of personal conduct affect the size of the respective changes. Individual reputation affects responses to that person; team reputation affects the sheriff's office. Better reputation brings better-paying work and more favorable responses from townspeople. Show current reputation and its effects, while letting the player infer what caused changes. Specific actions, responses, and numerical effects are implementation and playtesting parameters.
Rejected: 469-r-1. Existing effects only: Restrict reputation to its previously specified consequences.
Rejected: 469-r-2. Distinct reputation dimensions: Replace the existing reputation model with separate dimensions such as competence, integrity, and ruthlessness.
Rejected: 469-r-3. Distinct dimensions and wider effects: Combine separate reputation dimensions with the expanded consequences.
Rejected: 469-r-4. Cases primarily change both: Change both individual and team reputation primarily through completed cases.
Rejected: 469-r-5. Both respond to every notable action: Let cases, conduct, and incidents change both individual and team reputation according to who was involved.
Rejected: 469-r-6. Office-attributed actions: Use the wider set of events for both reputations, restricting team changes to actions publicly attributed to the office.
Rejected: 469-r-7. Report every cause: Require reporting reputation changes and their causes after each case or notable action.
Rejected: 469-r-8. Report major causes: Require reporting the causes of major reputation changes.
Rejected: 469-r-9. Reactions only: Keep reputation mostly implicit without showing its current standing and effects.
Rejected: 469-r-10. Unweighted changes: Change reputation for case outcomes and conduct without considering case difficulty or the severity of conduct.
Rejected: 469-r-11. Unwitnessed conduct counts: Change individual reputation for notable conduct regardless of witnesses or public knowledge.
Rejected: 469-r-12. Entirely implementation-selected events: Leave which events change reputation entirely to implementation and playtesting.

470. [SETTLED] Release playthrough flow: Deepen preparation before cases, including information gathering, planning, and choosing an approach. Before departure, players can ask townspeople, consult notices, and seek additional reports from contacts, then choose the team and equipment using what they have learned. Information concerns the target's location, defenses, and accomplices as available; preserve the lead rules in items 159, 287, and 292. When asking townspeople in a town about a case turns up nothing, nobody in that town knows more about that case for the rest of the day; asking again that day takes no time and tells nothing. Prioritize hunting wanted people, with cases chiefly distinguished by their target's location, defenses, and accomplices; vary these and enemy situations as the campaign progresses. Integrate these into the existing open-ended cycle of finding work, preparing, traveling, resolving cases, and choosing what to pursue next, while preserving the unscripted pursuit and the three-associate sequence in items 268 and 279–281.
Rejected: 470-r-1. Existing cycle only: Retain the existing cycle without requiring deeper preparation or new case variety.
Rejected: 470-r-2. Preparation only: Deepen preparation without requiring evolving case variety.
Rejected: 470-r-3. Case variety only: Add evolving case variety without requiring deeper preparation.
Rejected: 470-r-4. New objective types as equal first priority: Prioritize new objectives such as recovery and protection alongside wanted-person hunts, information gathering, and preparation.
Rejected: 470-r-5. Information quality as chief distinction: Primarily distinguish cases by the quality and reliability of advance information.
Rejected: 470-r-6. Preparation trade-offs as chief distinction: Primarily distinguish cases by preparation, travel, and approach trade-offs.
Rejected: 470-r-7. Equal emphasis: Require the three proposed case distinctions to receive equal emphasis.
Rejected: 470-r-8. No contact reports: Limit advance information gathering to townspeople and notices without additional reports from contacts.
Rejected: 470-r-9. Destination scouting preparation: Add a separate scouting phase at the destination before committing to an approach. Ordinary tactical observation and movement still apply.

471. [SETTLED] Release rewards: Reward accomplishments with money, automatic skill growth, and reputation, and provide a varied mix of distinctive recruits, equipment, and opportunities through reputation, accomplishments, discoveries, and relationships. Most access rewards are discoveries, with their requirements hidden until encountered. Keep payment dependent on case terms and outcome under item 133; leave the catalogue and eligibility conditions to implementation and playtesting.
Rejected: 471-r-1. Money and skills only: Limit the release reward direction to payment and automatic skill growth.
Rejected: 471-r-2. No access rewards: Add reputation effects but do not provide access to distinctive recruits, equipment, or opportunities as rewards.
Rejected: 471-r-3. Resolution trade-offs as the defining system: Make trade-offs between payment, reputation, and other benefits based on how a case is resolved the defining reward approach.
Rejected: 471-r-4. Mostly predictable access: Reveal the requirements for most access rewards in advance.
Rejected: 471-r-5. Broad requirements shown: Generally show broad access requirements while withholding exact reward and timing.
Rejected: 471-r-6. Mixed visible milestones: Define the access system as a mix of visible milestones and discoveries.
Rejected: 471-r-7. Exact reward list: Fix the distinctive rewards and their eligibility in the specification.
Rejected: 471-r-8. Specified categories and examples: Specify reward categories and examples before implementation generates individual rewards.
Rejected: 471-r-9. Authored and generated reward catalogue: Require a mixture of authored rewards and generated rewards from specified categories.

472. [SETTLED] Release system priorities: Prioritize extensions to cases and encounters, including their objectives, circumstances, opponents, and outcomes, and to the crew, including recruitment, personalities, loyalty, relationships, and progression. The pursuit, case persistence, surrender, and crew relationship extensions are specified in items 490–496.
Rejected: 472-r-1. Cases only: Prioritize cases and encounters without also prioritizing crew.
Rejected: 472-r-2. Crew only: Prioritize crew without also prioritizing cases and encounters.
Rejected: 472-r-3. Equal three-system priority: Give world and travel the same release-extension priority as cases and crew.

473. [SETTLED] Automatic skill-gain factors: Case difficulty sets the available skill gain, which is divided among participants according to their individual contributions. Count participation in the encounter, weighted by survival and case outcome; each participant receives a gain under item 153. Choose which of the three skills improves automatically, with variation. The precise distribution, selection probabilities, and amounts are implementation and playtesting parameters.
Rejected: 473-r-1. Random selection: Choose improvements by random selection alone.
Rejected: 473-r-2. Skill use alone: Favor skills used without using case difficulty and individual contribution as the governing factors.
Rejected: 473-r-3. Combined use and variation: Make skill use, contribution, difficulty, and added variation the defining selection approach.
Rejected: 473-r-4. Observable actions as contribution: Weight the share by actions such as engaging threats, covering teammates, or completing objectives.
Rejected: 473-r-5. Fulfilled role as contribution: Weight the share by role, such as combatant, cover, or support.
Rejected: 473-r-6. Actions and role: Weight the share by a combination of observable actions and fulfilled role.
Rejected: 473-r-7. Fixed rotation: Choose improved skills by a fixed rotation.
Rejected: 473-r-8. Weakest skill: Always favor the participant's weakest skill.
Rejected: 473-r-9. Case challenge: Choose the improved skill primarily from the case's overall challenge.

474. [SETTLED] Progression presentation: Present skills, traits, reputation, and their changes using understandable plain-language descriptions accompanied by glyphs. Apply the hiring and mission-results requirements in item 463; exact wording, glyph design, and additional presentation surfaces remain to be defined.
Rejected: 474-r-1. Text only: Use plain-language descriptions without glyphs.
Rejected: 474-r-2. Numerical presentation: Define progression primarily through numerical ratings and changes.
Rejected: 474-r-3. Named ranks and progress bars: Define progression primarily through named ranks and visible progress toward the next rank.
Rejected: 474-r-4. Numbers with explanations: Define progression through numerical ratings accompanied by plain-language explanations.

475. [SETTLED] Trait acquisition and behavior by category: Acquire habits through repeated relevant behavior, and acquire social, loyalty, and danger-response behaviors through repeated relevant interactions or a significant relevant event, as appropriate to the category. Apply acquired traits to situational choices, tie-breakers, and others' responses under item 468. Define each trait's precise trigger, thresholds, and behavioral effects during implementation and playtesting.
Rejected: 475-r-1. Fixed individual thresholds: Specify each trait's numerical triggers and effects in the specification.
Rejected: 475-r-2. Individually specified traits: Describe every trait's individual triggers and situational effects in the specification, leaving only numbers to playtesting.
Rejected: 475-r-3. No category rules: Leave all trait acquisition and behavior rules to implementation without the category guidance above.

476. [SETTLED] Contact reports: The availability of additional case reports from contacts before departure depends on reputation and relationships. Obtaining a report may cost money or time; apply ordinary payment and elapsed-time consequences under items 173 and 175. Reports concern the case information in item 470 and remain subject to the existing knowledge and lead rules. The specific contacts, terms, and rates are implementation and playtesting parameters.
Rejected: 476-r-1. Always free and immediate: Known contacts always provide reports without a money or time cost.
Rejected: 476-r-2. Explicit offer for every report: Require every contact to offer each report for a separately accepted fixed fee or delay.
Rejected: 476-r-3. Contact circumstances alone: Define availability and terms solely from the contact and circumstances without requiring reputation and relationships to affect availability.

477. [SETTLED] Building complexity: Generate building layouts ranging from simple to very complex. Building type, case difficulty, and location can influence complexity where plausible; difficult cases do not invariably use larger, more complex, or more fortified sites. Allow procedural variation and preserve item 70's validity requirements. Verify a range of layouts across building types, case difficulties, and locations using reproducible scenarios; exact dimensions and generation weights are implementation and playtesting parameters.
Rejected: 477-r-1. Uniform complexity: Generate buildings at essentially the same level of complexity regardless of type, case difficulty, or location.
Rejected: 477-r-2. Difficulty alone: Determine layout complexity from case difficulty without considering building type or location.

478. [SETTLED] Depth-first Push and backtracking: While Push is active, rank eligible advances depth-first along that teammate's own Push trail: continue from the current branch into an eligible uncleared hostile zone before returning to earlier branches. When the current branch has no eligible continuation, backtrack along the trail to the most recent branch with an eligible continuation, then advance there. Traverse friendly and cleared zones as needed without selecting cleared zones as new hostile objectives. Keep the Push bounded near the sheriff while the sheriff has not been identified down, using only the sheriff's last perceived position and perceivable communications; the precise bound is an implementation and playtesting parameter. Once the teammate identifies the sheriff down, lift that bound when independently pursuing the encounter objective under item 479. Respect each teammate's map, perceived threats, role coordination, physical routes, and blocked-goal rules; do not grant knowledge of unseen actors.
Rejected: 478-r-1. Global nearest first: Rank all eligible front-line zones by distance to the sheriff and friendlies instead of continuing depth-first along the teammate's trail.
Rejected: 478-r-2. Bound after sheriff down: Continue to restrict objective-directed advances near the sheriff's last known position after identifying the sheriff down.

479. [SETTLED] Autonomous objective after sheriff down: When a teammate identifies the sheriff as down, including incapacitated or dead, immediately cancel all of that teammate's standing orders and activate its own tactical judgment to pursue the encounter objective. It may independently advance, search and clear remaining areas, engage perceived threats, assist the sheriff, or withdraw as its judgment and existing capability, rescue, and retreat rules permit. It may initiate a Push without a prior order; the proximity bound in item 478 is lifted. The change is triggered by the teammate's own observation or a perceivable report, not by unseen scene state or automatic team-wide sharing. Mere loss of contact does not identify the sheriff as down. Other teammates make the transition when they independently identify it. Do not restore the cancelled orders automatically; preserve the ordinary rules for subsequent communications, physical actions, target recognition, and no first shot at an unaware hostile.
Rejected: 479-r-1. Persist orders after sheriff down: Retain prior commands and merely hold or continue an existing Push after identifying the sheriff down.
Rejected: 479-r-2. Automatic withdrawal: Require immediate withdrawal rather than independent judgment toward the objective.

480. [SETTLED] Quick Breach replay: Seed replay is available only in Quick Breach. Campaign encounters do not offer seed replay; returning to an unexpired case follows the persistent campaign retry rules in items 156 and 160.
Rejected: 480-r-1. In-campaign seed replay: Offer seed replay for campaign encounters while retaining campaign consequences.

481. [SETTLED] Map design priorities: Give equal priority to believable places and varied tactical situations in building and outdoor maps. Procedural generation provides variety in the physical character of places and the choices they offer; do not require comparing a generated site with previous encounters or guarantee that no two sites resemble one another.
Rejected: 481-r-1. Places first: Let geographical and functional plausibility lead, with tactical opportunities emerging naturally.
Rejected: 481-r-2. Tactics first: Design varied encounter challenges first, then make their settings believable.

482. [SETTLED] Building types and character: Tactical building sites include a required core of homes, saloons, hotels, shops, banks, offices, churches, workshops, warehouses, ranch buildings, and mining buildings. Additional historically appropriate types are permitted. Each type must be recognizable from its plausible purpose, layout, contents, and surroundings, not merely its label: homes include domestic living spaces; saloons include a public drinking area and supporting spaces; hotels include guest lodging and common or service spaces; shops have selling and storage areas; banks have a public transaction area and secured working or storage space; offices have workspaces and records or storage; churches have a congregation space and appropriate furnishings; workshops have work areas and tools suited to their trade; warehouses prioritize storage and loading; ranch buildings support livestock, supplies, or residential work; and mining buildings support extraction, processing, equipment, or workers. The particular spaces present and their arrangement depend on the building's size, use, region, and period. Apply item 241 to ordinary town life; this requirement concerns tactical sites and does not add ordinary playable town interiors.
Rejected: 482-r-1. Existing types only: Restrict the required core to the building types already present before this specification change.
Rejected: 482-r-2. Residential focus: Require homes and lodgings while leaving other kinds optional.
Rejected: 482-r-3. Fixed catalogue: Prohibit additional historically appropriate building types beyond the specified core.
Rejected: 482-r-4. Open-ended types: Leave the required set of building types entirely to implementation.

483. [SETTLED] Building layout and storeys: Within each recognizable type, procedurally vary footprints, room sizes and purposes, room connections, entrances, stairs, furnishings, cover, and surroundings as appropriate to the place. Do not base all types or instances on one shared hall-and-room layout. Support one or more playable storeys, including buildings with more than two, when plausible for the site. Every playable upper storey has a usable connected route to the ground; each stair flight follows item 55. Apply collision, navigation, AI perception and movement, cross-floor sight and gunfire, and displayed-floor rules across all storeys under items 17, 70, 72, and 398. The player must not gain sight or knowledge through a floor or wall without a valid sightline. Exact dimensions and generation weights are implementation and playtesting parameters.
Rejected: 483-r-1. Layout families only: Limit each type to a small set of fixed plan families with variation only within those families.
Rejected: 483-r-2. One typical plan: Use a single typical plan per type and vary only size, furnishings, and entries.
Rejected: 483-r-3. Two-storey breach houses: Require breach houses to have two storeys regardless of context.
Rejected: 483-r-4. At most two storeys: Exclude plausible buildings with more than two playable storeys.

484. [SETTLED] Outdoor places: Generate each outdoor site as a plausible fictional place informed by the specific campaign location and its nearby landscape, not merely a generic regional color scheme. Use period and regional research under item 98 and document sources and approximations. Vary landforms, vegetation, ground, water, natural features, routes, and historically appropriate human-made sites according to location and circumstances. Human-made sites can include roads, ranches, camps, and mining works where suitable. Their arrangement and physical materials affect routes, cover, concealment, and sightlines. Use regional rules rather than a fixed mandatory or exhaustive landscape catalogue. Keep the place legible as a coherent environment; exact terrain recipes and art remain implementation and playtesting parameters.
Rejected: 484-r-1. Broad region alone: Select scenery solely from broad regional characteristics without considering the local surroundings.
Rejected: 484-r-2. Exact reconstruction: Require actual site terrain and features to be reconstructed from geographical data.
Rejected: 484-r-3. Fixed landscape catalogue: Require a fixed list of landscape families or an exhaustive set of outdoor types.
Rejected: 484-r-4. Natural terrain only: Prioritize natural terrain while making human-made sites merely occasional.
Rejected: 484-r-5. Human-made sites only: Prioritize developed sites while keeping natural terrain simple.

485. [SETTLED] Outdoor elevation: Outdoor maps can include playable height differences such as slopes, ridges, and gullies where appropriate to the landscape. Their geometry affects traversability, collision, sightlines, cover, and projectile paths under the shared physical rules. Characters and AI must navigate and perceive the resulting terrain consistently with their capabilities. Depict height and obstacles clearly enough for the player to understand movement and exposure; do not add artificial visibility or projectile advantages.
Rejected: 485-r-1. Visual elevation only: Draw hills and gullies while resolving all outdoor combat on a single physical plane.

486. [SETTLED] Outdoor approaches: For a planned outdoor encounter, let the player choose the party's entry from any of the four cardinal map sides before the encounter. Present that choice using only information already learned; do not reveal unexplored terrain or unseen enemies. Each side has a usable party entry and a physically navigable route toward the site, subject to ordinary doors, barriers, and movement rules. A side may be dangerous or blocked from direct entry by natural features or built defenses, so that reaching the objective requires maneuvering to a usable entrance; safety is not guaranteed. Start a surprise road ambush from the party's travel situation instead of offering this approach choice. Apply physical extraction under item 437. Precise controls, spawn positions, and map geometry are implementation and playtesting parameters. An outdoor camp of two or more men watches one side, whichever side the party enters from, and its sentries face that side. Learning the case's location also tells which side the camp watches, and the choice of entry then suggests the opposite side, the camp's blind side, as the way in.
Rejected: 486-r-1. Fixed entry: Always start a planned outdoor encounter at one fixed side and rely on maneuvering around the site.
Rejected: 486-r-2. Direct access everywhere: Require a direct unobstructed path into the objective from every side.
Rejected: 486-r-3. Ambush approach choice: Offer the entry-side selection during a surprise road ambush.
Rejected: 486-r-4. Terrain preview: Reveal unknown terrain and obstacles in advance to support the choice.
Rejected: 486-r-5. Full tactical preview: Reveal the site and its unseen enemies before the choice.

487. [SETTLED] Site scale, integration, and variation: Allow tactical map dimensions and site scale to fit the setting and encounter. An encounter may span a building and meaningful outdoor surroundings or use a separate building or outdoor scene, as appropriate to the situation. Across procedural generation, vary spatial structure, routes, cover, sightlines, scale, and visual character in ways consistent with the site and item 481. Variety comes from probabilistic generation; do not compare against previous sites or guarantee uniqueness. Select case circumstances, hostile placement, and defenses consistently with the site and existing awareness and knowledge rules. Maintain playable routes and physical extraction without promising a safe approach.
Rejected: 487-r-1. Fixed map dimensions: Require every site to fit the existing fixed map dimensions.
Rejected: 487-r-2. Fixed size bands: Restrict map sizes to predetermined small, medium, and large classes.
Rejected: 487-r-3. Integrated sites only: Require every building encounter to include substantial outdoor surroundings.
Rejected: 487-r-4. Separate scenes only: Keep building and outdoor encounters separate with only limited surroundings.
Rejected: 487-r-5. Avoid recent repeats: Compare generated sites against recent encounters and prevent similar layouts.
Rejected: 487-r-6. Mandatory signature feature: Require a prominent landmark or signature set piece at every encounter.

488. [SETTLED] Persistent case sites: When the party returns to the same unexpired case, preserve the site's layout and its lasting physical changes from prior visits. These include opened or damaged barriers and moved objects; retain bodies where existing world and time rules permit. People and circumstances may change under the existing case, time, and knowledge rules. Apply ordinary campaign consequences and retry rules in items 156 and 160. This persistence does not enable campaign seed replay under item 480. New campaigns use these requirements; migration of existing saved sites is not required.
Rejected: 488-r-1. Layout only: Preserve the layout while resetting lasting physical changes.
Rejected: 488-r-2. Structural changes only: Persist barriers and structural changes but reset movable objects and bodies.
Rejected: 488-r-3. Regenerate site: Allow the case site layout to change on return to the same unexpired case.
Rejected: 488-r-4. Mandatory save migration: Require existing saved sites to be migrated to the new map requirements.

489. [SETTLED] Tactical map acceptance: Review representative generated building and outdoor sites visually and through play across core building types, locations, site scales, case circumstances, and encounter types. Judge recognizability, period and local plausibility, coherent surroundings, and varied tactical situations; random repetition is permitted under item 487. Use reproducible scenarios and mechanical checks for usable entries and routes; one-, two-, and more-than-two-storey buildings; stair traversal and cross-floor sight, shooting, and AI; outdoor height, collision, sightlines, cover, and projectile interactions; selection and usable entry from all four sides without revealing undiscovered information; ambush starts; integrated and separate sites; extraction; and returning to a changed case site with its physical state retained. Verify Quick Breach seed reproduction under items 59 and 65. Validate against existing movement, wounds, awareness, and tactical AI requirements. Document historical sources and deviations; exact sample sizes and generation weights are implementation and playtesting parameters.
Rejected: 489-r-1. Review only: Rely on human review for mechanical validity without reproducible checks.
Rejected: 489-r-2. Fixed diversity thresholds: Require numerical minimum diversity scores or a fixed count of every site variant.

490. [SETTLED] Globally persistent cases: Maintain one world-wide pool of cases. Each case has a persistent identity, target, location, status, and history shared by every town and source that refers to it; multiple offers are references to the same case, not independently generated copies. An active case is eligible in the local case pool near its target's location, including if first offered elsewhere; it need not appear in every individual notice or conversation. Distant towns may offer the same case when appropriate. Acceptance, discovered information, encounters, abandonment, completion, and expiry update the shared case and its history. Immediately remove or update its active offers everywhere when its status changes. A source discloses only information available to that source, and the world-wide pool does not itself reveal undiscovered cases, targets, or locations to the player. An expired case that returns retains its earlier history under items 158 and 160. The definition of vicinity, offer selection, and information distribution are implementation and playtesting parameters.
Rejected: 490-r-1. Independent local offers: Generate unrelated local copies of a case and reconcile them only after an outcome.
Rejected: 490-r-2. Always presented locally: Require every active local case to appear in each town's player-facing offers.
Rejected: 490-r-3. Optional local eligibility: Permit an active case to be absent from the local pool near its target.
Rejected: 490-r-4. Delayed status propagation: Leave active offers stale after completion or expiry until news travels between towns.

491. [SETTLED] Ordinary case pursuit: Wanted-person cases vary in pursuit length: some disclose the target's location immediately, while others require successive leads from people, notices, or contacts. Each intermediate lead identifies a reachable town and a specific person, notice, or contact to seek there. The player seeks that source to obtain the next report. Ordinary-case reports are accurate when received; they may omit information under item 116. A target's confirmed location remains valid through arrival under item 159. Revealing a lead can reveal its destination through item 172, but the shared case pool does not expose future leads or undiscovered information. Apply world time, deadlines, and the shared case state throughout the pursuit. Exact lead content, number, availability, and timing are implementation and playtesting parameters.
Rejected: 491-r-1. Target relocation: Let an active case's confirmed target location become outdated before the party arrives.
Rejected: 491-r-2. Every case has a chain: Require multiple leads before locating the target in every case.
Rejected: 491-r-3. Arrival reveals the lead: Discover the next lead automatically on arriving in its town.
Rejected: 491-r-4. Mistaken reports: Permit ordinary-case reports to be false when received.
Rejected: 491-r-5. Town only: Identify only a town and leave the player to find an unspecified source for each intermediate lead.

492. [SETTLED] Ordinary wanted-target surrender: An ordinary wanted target may offer surrender based on its assessment of danger, wounds, temperament, and circumstances; surrender is not guaranteed. An offer is binding: the target does not resume resistance after offering surrender. The player must accept the surrendering target, and it must be secured, for it to count as captured and taken down. The sheriff secures an accepted target himself. When the sheriff is up but has not reached a target he accepted within a short wait, a teammate still in the fight secures it, and when the sheriff is down a teammate still in the fight secures every surrendered target after a short aftermath; in both cases only once no hostile is still fighting, so that a fight can always end. A target the player has not accepted waits while the sheriff is up. A target incapacitated without surrender is taken down under item 30 but is not captured; do not capture it by restraint. Ordinary accomplices do not surrender under this rule. A secured target no longer counts as an active hostile; other active hostiles and the encounter's ordinary resolution rules still apply. Associate cases retain item 291's surrender or restraint options.
Rejected: 492-r-1. Restraint only: Disallow ordinary target surrender and permit capture only by restraining an incapacitated target.
Rejected: 492-r-2. Accomplice surrender: Also permit ordinary accomplices to surrender under this rule.
Rejected: 492-r-3. Automatic capture: Count surrender as capture without acceptance and securing.
Rejected: 492-r-4. Revocable surrender: Permit a target to resume resistance after offering surrender.
Rejected: 492-r-5. Sheriff-only securing: While the sheriff is up, only the sheriff secures an accepted target, however long it takes him to reach it.

493. [SETTLED] Equivalent ordinary target outcomes: In an ordinary wanted-person case, securing a surrendered target, killing the target, or incapacitating the target without surrender each count as taking the target down. These outcomes are equivalent for that case's payment and reputation; do not make a living target a condition for a better ordinary-case reward or reputation result. Apply the case's other terms and encounter-resolution requirements, including the treatment of remaining hostiles, without creating a failed-case outcome. Associate cases continue to use their specific questioning and lead rules in items 280–283.
Rejected: 493-r-1. Capture preferred: Always reward a live capture more favorably than killing or incapacitation.
Rejected: 493-r-2. Terms favor capture: Allow ordinary-case payment or reputation to differ according to whether the target is captured, killed, or incapacitated.
Rejected: 493-r-3. Incapacitation is not a successful takedown: Deny an ordinary case's taken-down outcome for an incapacitated target who did not surrender.

494. [SETTLED] Crew relationships: Track one shared relationship for each pair of crew members, including each teammate and the sheriff. Keep each teammate's loyalty to the office as a separate measure; the relationship with the sheriff and relevant major events may influence that loyalty. A known major event can change a relationship on its own, and later major events build on its history. Significant shared danger, help, neglect, and serious disputes can affect a relationship when the people involved experience or learn of the event; an unknown event does not. Apply acquired traits under items 468 and 475. Relationships influence loyalty, reactions, willingness to help, and autonomous situational choices without taking control of the sheriff from the player. Preserve item 135's rules on journey refusal and departure. Exact event thresholds, magnitude, and effects are implementation and playtesting parameters.
Rejected: 494-r-1. Sheriff relationships only: Do not track relationships between teammates.
Rejected: 494-r-2. Team cohesion only: Replace individual relationships with a single team-wide measure.
Rejected: 494-r-3. Directional relationships: Track each person's view of the other separately.
Rejected: 494-r-4. Loyalty is the relationship: Replace separate office loyalty with the sheriff-teammate relationship.
Rejected: 494-r-5. Accumulation required: Require several major events before any relationship change.
Rejected: 494-r-6. Unknown events count: Change a relationship for an event a participant neither experienced nor learned about.
Rejected: 494-r-7. Presentation only: Restrict relationships to dialogue without behavioral or loyalty effects.

495. [SETTLED] Crew disputes and presentation: Strained relationships can lead to disagreements and departures, subject to the existing departure rules. Teammates resolve their disputes autonomously; do not require the sheriff to intervene or require disputes to become violent. Present relationship and office-loyalty status through understandable plain-language descriptions, consistent with item 474. Do not require an explicit log explaining every relationship change. Exact dispute events, wording, thresholds, and presentation surfaces are implementation and playtesting parameters.
Rejected: 495-r-1. Sheriff intervenes: Require contextual player choices to resolve teammates' disputes.
Rejected: 495-r-2. Dialogue only: Restrict friction to minor dialogue with no serious disagreement or departure.
Rejected: 495-r-3. Detailed event log: Require the player to see an explicit history of each relationship change and its effect.
Rejected: 495-r-4. Implicit relationships: Convey relationship status only through dialogue and behavior without showing it.

496. [SETTLED] Case and relationship acceptance: Use reproducible scenarios to verify that an active case offered at a distant town is eligible near its target, both sources refer to the same case and history, acceptance and subsequent state changes propagate immediately, and undiscovered information remains hidden. Exercise immediate and multi-lead pursuits, source discovery, accurate reports, deadlines, and a confirmed target location remaining valid through arrival. Verify ordinary target surrender, acceptance and securing, binding surrender, incapacitation without capture, equivalent ordinary-case payment and reputation, remaining-hostile encounter resolution, and associate-specific capture and questioning. Verify shared pairwise relationships, a single known major event changing a relationship, accumulated history, unknown events having no effect, separate office loyalty, autonomous disputes and departures subject to item 135, and understandable status presentation. Exact scenario seeds and numerical thresholds are implementation and playtesting parameters.

497. [SETTLED] Terrain sight shading: On outdoor relief, the drawn field shows each patch of ground by the viewer's eye height and the terrain between: from level ground all level ground within the field shows; lower ground shows only where the eye looks down onto it past any crest or cover; of higher ground only the face turned towards the viewer shows, not its top. A patch counts as seen when a point about low-scrub height above it clears the horizon. Ground hidden this way inside the field is drawn black, like everything outside the field, and updates as the viewer moves. The drawn field, the sight of people and projectile paths all read the stepped ground of item 485, the same as walking and collision, so what is drawn black, what can be seen and what can be hit agree. A person seen while the ground under them is hidden is drawn over the darkness, cut to the part that shows, such as head and shoulders above a rim. High ground gains only by this geometry; no bonus is added. Generated landforms include real drops where the landscape has them, such as mesa rims, canyon walls, gully banks, rimrock and terrace risers, crossed by ramps and passes, and open country has knolls and hollows, so dead ground is common.
Rejected: 497-r-1. Hidden ground dimmed: Draw terrain-hidden ground dimmed, so the landform still reads while people, items and effects there stay hidden.
Rejected: 497-r-2. Ground-surface test: Count a patch as seen only when the bare ground itself clears the horizon.
Rejected: 497-r-3. Separate height models: Draw the field on the smooth surface while sight of people and shots use the stepped ground.
Rejected: 497-r-5. Smooth surface: Let sight, shots and the drawn field read a surface blended between cells while walking keeps the steps.
Rejected: 497-r-6. Steeper walkable slopes: Allow steeper walkable steps instead of cliff edges.
Rejected: 497-r-4. Drawn-only fix: Hide a person unless the smooth surface clears them, while shots keep the stepped ground.

498. [SETTLED] Campaign retry and Ironman: When a campaign ends in failure, the end screen offers Retry. Retry returns the campaign to the last autosave made outside a running scene before the loss and continues from there; an encounter played again after a Retry gets a fresh scene, never a replay of the lost one. The first Retry asks for confirmation. A campaign is Ironman until it is retried or a running fight is left; a retried campaign loses the Ironman status for good, and with it a special Ironman reward, specified in item 499. Leaving a running fight by closing or reloading the page is settled on return as a pull-out from a fresh scene; because that undoes the fight's wounds and deaths, it also loses the Ironman status for good, and the return message says so. A won campaign offers no Retry.
Rejected: 498-r-1. No retry: Keep every campaign loss final.
Rejected: 498-r-2. Retry only: Only a Retry loses the Ironman status; leaving a running fight keeps it.

499. [SETTLED] Ironman reward, dynamite: Winning a campaign that kept its Ironman status earns dynamite for the player for good, kept by the browser across campaigns; the end screen names the reward. From then on every store in every campaign sells dynamite in bundles of five half-pound sticks of 40 % straight dynamite with fuse, about 1 kg TNT equivalent, at a period price; a campaign starts with none, the office keeps what it buys, and the stores buy it back like ammunition. The sheriff takes up to three bundles into a tactical scene, not into duels or brawls; thrown bundles are spent, the rest come back, and all he carried is lost if he dies in a lost fight. Quick Breach gives him three bundles once the reward is earned. Dynamite is not a roster weapon (item 361-r-1 stands). One press of G runs the whole throw, each part shown by its own pose: the gun goes to the holster, the bundle comes out of the coat, a match is struck and flares, the fuse is lit, the arm draws back, the bundle is thrown, and the gun is drawn again; until then the sheriff cannot shoot, reload, stab, use anything or sprint, and he cannot start it lying down. The throw is always full strength, about 13 m/s from the hand: a lob of about 40 degrees in the open, flattened under a ceiling, and flattened to pass through the opening when the line of the throw meets a window, breaking a closed pane on the way; it is a few degrees and a few percent off, more on the move, in pain or with a wounded arm. The fuse burns 4 to 5.5 seconds, never exactly alike. A bundle held by a sheriff who goes down or loses the use of his arm falls at his feet still burning. The bundle bounces off walls, including the wall above a door, furniture, ceilings and people, comes to rest on floors or low furniture and fizzes audibly. The blast follows a published overpressure law for the charge, with walls between shielding most of it and a room's walls reflecting it: within about a metre and a half it kills; within about two and a half it does grave chest or abdominal injury; within about five it ruptures eardrums and throws a person down; farther it staggers, makes the aim waver and dulls hearing for a time. It throws debris in every direction and demolishes by the pressure that reaches each thing, nearest first, so a wall blown out lets the pulse through to what lies behind it: plank partitions, frame walls, furniture, doors with their frames, window frames and outdoor cover such as fences, wagons and brush within a few metres are blown away into rubble; doors farther off are blown in and glass breaks out to about twenty-five metres; adobe and rock stand. It flings or sets off other bundles nearby, leaves a scorch mark and is heard across the whole site. The followed character's ears ring and the world sounds dull while hearing recovers. Anyone who sees a lit bundle near him and takes in what it is, faster with experience, cries a warning and runs from it, seeking a wall between, or throws himself flat when there is no time. The sheriff calls out before a throw unless he is working by hand signal.
Rejected: 499-r-1. Free supply: Give the sheriff a fixed number of sticks in every campaign scene instead of selling them.
Rejected: 499-r-2. Throw strength: Let holding G cook the fuse and the aim point set the length of the throw.
Rejected: 499-r-3. Single stick: Throw one half-pound stick, which by the overpressure law breaks glass and doors but no walls.

500. [SETTLED] Single source of places: The generated settlement data built from the period sources under item 238 is the only source of places, routes, and their services. Do not add hand-made places, routes, or place-specific overrides. Saves that name places outside that data are refused.
Rejected: 500-r-1. Curated regional places: Keep hand-made places and routes for the Cochise County area that override the generated data.

## Deleted items

6, 34, 45, 61, 67, 104, 112, 113, 114, 118, 119, 122, 128, 138, 146, 147, 161, 165, 176, 178, 179, 190, 237, 252, 263, 317.

## Decision boundary

This decision boundary applies to the full specification. Implementation parameters such as precise timings, generation ranges, key bindings, and browser performance targets are left to implementation and playtesting under the implementation defaults; they do not require further user decisions.

Decisions d-1 through d-23 have been incorporated into items 424–446, with their rejected alternatives recorded. Decisions d-24 and d-25 are incorporated into items 450–451 for the draw-last bonus. Decisions d-26, d-27, and d-28 are incorporated into items 446, 433, and 413 for Cover, Push pursuit, and Hold; their rejected alternatives are recorded there. Settled requirements still require implementation and acceptance verification; decision closure is not a claim that these checks have passed.

Decisions d-34 through d-41 are incorporated into items 467–474. Their chosen directions create the following more specific decisions.

Decisions d-42 through d-49 are incorporated into items 299 and 467–473. Their chosen directions create the following more specific decisions.

Decisions d-50 through d-56 are incorporated into items 467–473. Their chosen directions create the following more specific decisions.

Decisions d-57 through d-62 are incorporated into items 467–473. Their chosen directions create the following more specific decisions.

Decisions d-63 through d-66 are incorporated into items 468–471. Their chosen directions create the following more specific decisions.

Decisions d-67 and d-68 are incorporated into items 475–476. The case and crew choices refining item 472 are incorporated into items 490–496. Settled requirements still require implementation and acceptance verification; decision closure is not a claim that these checks have passed.
