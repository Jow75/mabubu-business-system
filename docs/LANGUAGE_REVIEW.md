# Language review — French and Swahili

For a family member who reads **French** and/or **Swahili** well. Nobody has reviewed these
translations yet: every row below is **not reviewed**. They were written by the developers (with
AI help), not by a native speaker.

**How to help:** read the French or Swahili column. If a phrase is wrong, unnatural, too formal, or
not what people in the Comoros / Mombasa / Dar es Salaam would say, write the better wording in the
*Correction* column (or on paper with the key). Start with section 1, then 2. Sections 3 and 4 can
wait.

Rules: keep **Mabubu**, **Madeira**, **dera**, place names, people's names and the `{words in braces}`
exactly as they are (the app fills them in). KMF, KES, TZS, USD stay as they are. Do not translate
garment, vendor or place names — they are the family's own records.

Generated from `src/shared/i18n/en.ts`, `fr.ts`, `sw.ts` (keys: 1175). Corrections go back
into those files; re-run the generator so this list stays in step.

## 1. Sign-in, owner recovery and device approval

Seen by everyone at the door of the app. Most important: a wrong word here locks people out or confuses the owner. (110 phrases)

| Key | English | Français | Kiswahili | Status | Correction |
|---|---|---|---|---|---|
| `auth.tagline` | Every dera, from Mombasa to Ngazidja. | Chaque dera, de Mombasa à Ngazidja. | Kila dera, kutoka Mombasa hadi Ngazidja. | not reviewed |  |
| `auth.blurb` | Purchases, shipments, the day’s sales and the cash — recorded where it happens, even without internet, and seen by the family wherever they are. | Achats, envois, ventes du jour et caisse — enregistrés là où ils ont lieu, même sans internet, et visibles par la famille où qu’elle soit. | Manunuzi, mizigo, mauzo ya siku na pesa — yanarekodiwa yanapotokea, hata bila intaneti, na familia inayaona popote ilipo. | not reviewed |  |
| `auth.welcome` | Welcome | Bienvenue | Karibu | not reviewed |  |
| `auth.who` | Who is working? | Qui travaille ? | Nani anafanya kazi? | not reviewed |  |
| `auth.signInOnline` | Sign in online | Connexion en ligne | Ingia mtandaoni | not reviewed |  |
| `auth.someoneElse` | Someone else | Une autre personne | Mtu mwingine | not reviewed |  |
| `auth.firstTime` | First time here | Première fois ici | Mara ya kwanza hapa | not reviewed |  |
| `auth.demo` | Explore the demo | Découvrir la démo | Jaribu programu | not reviewed |  |
| `auth.noInternetNew` | No internet. Signing in on a new device needs a connection once. | Pas d’internet. La première connexion sur un nouvel appareil demande une connexion. | Hakuna intaneti. Kuingia kwenye kifaa kipya kunahitaji mtandao mara moja. | not reviewed |  |
| `auth.triesLeft` | {message} {n} tries left before a short lock. | {message} Encore {n} essai(s) avant un court blocage. | {message} Majaribio {n} yamebaki kabla ya kufungiwa kwa muda mfupi. | not reviewed |  |
| `auth.enterCode` | Enter your code | Saisissez votre code | Weka namba yako ya siri | not reviewed |  |
| `auth.enterCodeOnline` | {reason} Enter your code to sign in online. | {reason} Saisissez votre code pour vous connecter en ligne. | {reason} Weka namba yako ya siri kuingia mtandaoni. | not reviewed |  |
| `auth.removeProfile` | Remove {name} from this device | Retirer {name} de cet appareil | Mwondoe {name} kwenye kifaa hiki | not reviewed |  |
| `auth.removeConfirm` | Remove {name} from this device? Their account and records stay on the server; they can sign in here again with their code. | Retirer {name} de cet appareil ? Son compte et ses données restent sur le serveur ; cette personne pourra se reconnecter ici avec son code. | Mwondoe {name} kwenye kifaa hiki? Akaunti yake na kumbukumbu zake zinabaki kwenye seva; anaweza kuingia hapa tena kwa namba yake. | not reviewed |  |
| `auth.removeUnsent` | {name} has {n} records on this device that have not reached the server yet. Removing now deletes them for good. Sign in and let them send first. | {name} a {n} enregistrements sur cet appareil qui ne sont pas encore arrivés au serveur. Retirer maintenant les supprime définitivement. Connectez-vous d’abord et laissez-les s’envoyer. | {name} ana kumbukumbu {n} kwenye kifaa hiki ambazo bado hazijafika kwenye seva. Ukimwondoa sasa zitafutwa kabisa. Ingia kwanza na uziache zitumwe. | not reviewed |  |
| `auth.removeYes` | Remove | Retirer | Ondoa | not reviewed |  |
| `auth.removeAnyway` | Delete them and remove | Les supprimer et retirer | Zifute na umwondoe | not reviewed |  |
| `auth.signIn` | Sign in | Connexion | Ingia | not reviewed |  |
| `auth.yourNameQ` | What is your name? | Quel est votre nom ? | Jina lako ni nani? | not reviewed |  |
| `auth.nameHelp` | Use the name the owner gave your account. The first time on a new phone or laptop, the owner approves it once. | Utilisez le nom que le propriétaire a donné à votre compte. La première fois sur un nouveau téléphone ou ordinateur, le propriétaire doit l’autoriser une fois. | Tumia jina ambalo mmiliki aliipa akaunti yako. Mara ya kwanza kwenye simu au kompyuta mpya, mmiliki ataidhinisha mara moja. | not reviewed |  |
| `auth.yourName` | Your name | Votre nom | Jina lako | not reviewed |  |
| `auth.offlineFirst` | You are offline. A first sign-in on this device needs internet. | Vous êtes hors ligne. La première connexion sur cet appareil demande internet. | Uko nje ya mtandao. Kuingia mara ya kwanza kwenye kifaa hiki kunahitaji intaneti. | not reviewed |  |
| `auth.setupLink` | First setup or owner recovery | Première configuration ou récupération du propriétaire | Usanidi wa kwanza au kurejesha akaunti ya mmiliki | not reviewed |  |
| `auth.stillWaiting` | Still waiting for approval. | Toujours en attente d’autorisation. | Bado inasubiri idhini. | not reviewed |  |
| `auth.newDevice` | New device | Nouvel appareil | Kifaa kipya | not reviewed |  |
| `auth.waitingOwner` | Waiting for the owner | En attente du propriétaire | Inamsubiri mmiliki | not reviewed |  |
| `auth.pendingBody` | Your code is correct. Because this is a new device, the owner must allow it once. Ask them to open People & devices and approve the request with this code: | Votre code est correct. Comme c’est un nouvel appareil, le propriétaire doit l’autoriser une fois. Demandez-lui d’ouvrir Personnes et appareils et d’approuver la demande avec ce code : | Namba yako ni sahihi. Kwa kuwa hiki ni kifaa kipya, mmiliki lazima akiruhusu mara moja. Mwombe afungue Watu na vifaa na aidhinishe ombi lenye namba hii: | not reviewed |  |
| `auth.checkAgain` | Check again | Vérifier à nouveau | Angalia tena | not reviewed |  |
| `auth.autoCheck` | This page checks by itself every few seconds. | Cette page vérifie automatiquement toutes les quelques secondes. | Ukurasa huu unaangalia wenyewe kila baada ya sekunde chache. | not reviewed |  |
| `auth.ownerNewDeviceTitle` | This computer needs to be recognised again | Cet ordinateur doit être reconnu à nouveau | Kompyuta hii inahitaji kutambuliwa tena | not reviewed |  |
| `auth.ownerNewDeviceBody` | Your code is correct, and your account and records are safe on the server. But this browser no longer has the saved key that identified this device, so Mabubu sees it as a new device with the code below. As the owner, allow it yourself with your recovery key — or approve it from another device where you are already signed in (People & devices). | Votre code est correct, et votre compte et vos données sont en sécurité sur le serveur. Mais ce navigateur n’a plus la clé enregistrée qui identifiait cet appareil : Mabubu le voit donc comme un nouvel appareil, avec le code ci-dessous. En tant que propriétaire, autorisez-le vous-même avec votre clé de récupération — ou approuvez-le depuis un autre appareil où vous êtes déjà connecté (Personnes et appareils). | Namba yako ni sahihi, na akaunti yako na kumbukumbu zako ziko salama kwenye seva. Lakini kivinjari hiki hakina tena ufunguo uliohifadhiwa uliotambulisha kifaa hiki, kwa hiyo Mabubu inakiona kama kifaa kipya chenye namba iliyo hapa chini. Kama mmiliki, kiruhusu mwenyewe kwa ufunguo wako wa kurejesha — au kiidhinishe kutoka kifaa kingine ambacho tayari umeingia (Watu na vifaa). | not reviewed |  |
| `auth.useRecoveryKey` | Allow this device with my recovery key | Autoriser cet appareil avec ma clé de récupération | Ruhusu kifaa hiki kwa ufunguo wangu wa kurejesha | not reviewed |  |
| `auth.ownerAutoCheck` | If you approve it from another device instead, this page notices by itself. | Si vous l’approuvez plutôt depuis un autre appareil, cette page s’en apercevra toute seule. | Ukikiidhinisha kutoka kifaa kingine badala yake, ukurasa huu utagundua wenyewe. | not reviewed |  |
| `auth.autoCheckStopped` | Stopped checking by itself. Tap “Check again” once the device is approved. | La vérification automatique est arrêtée. Appuyez sur « Vérifier à nouveau » une fois l’appareil approuvé. | Imeacha kuangalia yenyewe. Bofya “Angalia tena” kifaa kikishaidhinishwa. | not reviewed |  |
| `auth.whyNewDevice` | If this device was approved before, its saved data for this site was removed — by clearing browsing data, a private or Guest window, a cleaning app, or a browser setting that deletes site data on closing. Records already sent are not affected. | Si cet appareil était déjà approuvé, ses données enregistrées pour ce site ont été supprimées — en effaçant les données de navigation, avec une fenêtre privée ou invité, une application de nettoyage, ou un réglage du navigateur qui efface les données des sites à la fermeture. Les données déjà envoyées ne sont pas touchées. | Kama kifaa hiki kiliidhinishwa kabla, data yake iliyohifadhiwa kwa tovuti hii imefutwa — kwa kufuta data ya kuvinjari, dirisha la faragha au la mgeni, programu ya kusafisha, au mpangilio wa kivinjari unaofuta data ya tovuti kinapofungwa. Kumbukumbu zilizokwisha tumwa haziathiriki. | not reviewed |  |
| `auth.storageBlockedEyebrow` | Storage blocked | Stockage bloqué | Hifadhi imezuiwa | not reviewed |  |
| `auth.storageBlockedTitle` | This browser will not let Mabubu save anything | Ce navigateur ne laisse pas Mabubu enregistrer quoi que ce soit | Kivinjari hiki hakiruhusu Mabubu kuhifadhi chochote | not reviewed |  |
| `auth.storageBlockedBody` | Mabubu keeps this device’s identity and records not yet sent in the browser. It cannot do that here — usually because this is a private or Guest window, or site storage is switched off. Open Mabubu in a normal Chrome window, or open the installed app. | Mabubu garde dans le navigateur l’identité de cet appareil et les données pas encore envoyées. C’est impossible ici — en général parce qu’il s’agit d’une fenêtre privée ou invité, ou que le stockage des sites est désactivé. Ouvrez Mabubu dans une fenêtre Chrome normale, ou ouvrez l’application installée. | Mabubu huhifadhi kwenye kivinjari utambulisho wa kifaa hiki na kumbukumbu ambazo bado hazijatumwa. Haiwezekani hapa — kwa kawaida kwa sababu hili ni dirisha la faragha au la mgeni, au hifadhi ya tovuti imezimwa. Fungua Mabubu katika dirisha la kawaida la Chrome, au fungua programu iliyosakinishwa. | not reviewed |  |
| `auth.tryAgain` | Try again | Réessayer | Jaribu tena | not reviewed |  |
| `auth.demoEyebrow` | Demo | Démo | Majaribio | not reviewed |  |
| `auth.seeAs` | See it as… | Voir en tant que… | Ione kama… | not reviewed |  |
| `auth.demoBody` | Three weeks of sample records, kept only on this device and never sent anywhere. Each person sees exactly what their role allows. | Trois semaines de données d’exemple, gardées uniquement sur cet appareil et jamais envoyées. Chaque personne voit exactement ce que son rôle permet. | Wiki tatu za kumbukumbu za mfano, zimehifadhiwa kwenye kifaa hiki tu na hazitumwi popote. Kila mtu anaona kile tu ambacho nafasi yake inaruhusu. | not reviewed |  |
| `auth.comoros` | Comoros | Comores | Komoro | not reviewed |  |
| `auth.pinRule` | Real sign-in uses a {w}-digit code for workers and {o} digits for the owner and managers. | La vraie connexion utilise un code de {w} chiffres pour les vendeurs et de {o} chiffres pour le propriétaire et les responsables. | Kuingia halisi kunatumia namba ya tarakimu {w} kwa wafanyakazi na tarakimu {o} kwa mmiliki na mameneja. | not reviewed |  |
| `pin.digits` | {n} digits entered | {n} chiffres saisis | Tarakimu {n} zimewekwa | not reviewed |  |
| `pin.lenHint` | {min}–{max} digits | {min} à {max} chiffres | Tarakimu {min}–{max} | not reviewed |  |
| `pin.lenAny` | Workers {w} digits · owner & managers {o}–{max} | Vendeurs {w} chiffres · propriétaire et responsables {o} à {max} | Wafanyakazi tarakimu {w} · mmiliki na mameneja {o}–{max} | not reviewed |  |
| `pin.deleteLast` | Delete last digit | Effacer le dernier chiffre | Futa tarakimu ya mwisho | not reviewed |  |
| `pin.delete` | Delete | Effacer | Futa | not reviewed |  |
| `pin.enter` | Enter | Valider | Ingia | not reviewed |  |
| `setup.eyebrow` | Owner setup | Configuration du propriétaire | Usanidi wa mmiliki | not reviewed |  |
| `setup.title` | Set up the business | Configurer l’entreprise | Sanidi biashara | not reviewed |  |
| `setup.lead` | Enter the setup key that was saved on the server. This creates the owner account and approves this device. The same key recovers the owner account if a phone is lost. | Saisissez la clé de configuration enregistrée sur le serveur. Elle crée le compte du propriétaire et autorise cet appareil. La même clé permet de récupérer le compte du propriétaire si un téléphone est perdu. | Weka ufunguo wa usanidi uliohifadhiwa kwenye seva. Unaunda akaunti ya mmiliki na kuidhinisha kifaa hiki. Ufunguo huo huo unarejesha akaunti ya mmiliki simu ikipotea. | not reviewed |  |
| `setup.key` | Setup key | Clé de configuration | Ufunguo wa usanidi | not reviewed |  |
| `setup.recoveryHint` | For recovery, enter the existing owner’s name. | Pour une récupération, saisissez le nom du propriétaire existant. | Kwa kurejesha, weka jina la mmiliki aliyepo. | not reviewed |  |
| `setup.code` | Owner code (6–8 digits) | Code du propriétaire (6 à 8 chiffres) | Namba ya siri ya mmiliki (tarakimu 6–8) | not reviewed |  |
| `setup.codeHint` | Do not use your phone PIN or birth year. | N’utilisez pas le code de votre téléphone ni votre année de naissance. | Usitumie PIN ya simu yako wala mwaka wa kuzaliwa. | not reviewed |  |
| `setup.prefilled` | Your name and code are filled in from the sign-in you just did. Enter your recovery key to allow this device. | Votre nom et votre code sont repris de la connexion que vous venez de faire. Saisissez votre clé de récupération pour autoriser cet appareil. | Jina lako na namba yako vimejazwa kutoka kuingia ulikofanya sasa hivi. Weka ufunguo wako wa kurejesha kuruhusu kifaa hiki. | not reviewed |  |
| `setup.recoverCodeHint` | Enter your current owner code to keep it. A different code here becomes your new owner code. | Saisissez votre code propriétaire actuel pour le garder. Un autre code ici deviendra votre nouveau code propriétaire. | Weka namba yako ya sasa ya mmiliki ili uibakize. Namba tofauti hapa itakuwa namba yako mpya ya mmiliki. | not reviewed |  |
| `setup.repeat` | Repeat the code | Répétez le code | Rudia namba | not reviewed |  |
| `setup.mismatch` | The codes do not match. | Les codes ne correspondent pas. | Namba hazilingani. | not reviewed |  |
| `setup.failed` | Setup failed. | La configuration a échoué. | Usanidi umeshindwa. | not reviewed |  |
| `setup.busy` | Setting up… | Configuration… | Inasanidi… | not reviewed |  |
| `setup.create` | Create owner account | Créer le compte du propriétaire | Unda akaunti ya mmiliki | not reviewed |  |
| `setup.recoverEyebrow` | Owner recovery | Récupération du propriétaire | Kurejesha mmiliki | not reviewed |  |
| `setup.recoverTitle` | Recover owner access | Récupérer l’accès propriétaire | Rejesha ufikiaji wa mmiliki | not reviewed |  |
| `setup.recoverLead` | The business is already set up. Enter your setup / recovery key and the owner’s name to allow this device. This does not create a second owner and does not change any records. | L’entreprise est déjà configurée. Saisissez votre clé de configuration / récupération et le nom du propriétaire pour autoriser cet appareil. Cela ne crée pas de second propriétaire et ne modifie aucune donnée. | Biashara tayari imesanidiwa. Weka ufunguo wako wa usanidi / kurejesha na jina la mmiliki kuruhusu kifaa hiki. Haitengenezi mmiliki wa pili wala haibadilishi kumbukumbu zozote. | not reviewed |  |
| `setup.recoverCreate` | Recover access | Récupérer l’accès | Rejesha ufikiaji | not reviewed |  |
| `pp.requestFailed` | Request failed | La demande a échoué | Ombi limeshindwa | not reviewed |  |
| `pp.device` | Device | Appareil | Kifaa | not reviewed |  |
| `pp.onlineOnly` | People and devices are managed online. Connect to the internet. | Les personnes et appareils se gèrent en ligne. Connectez-vous à internet. | Watu na vifaa vinasimamiwa mtandaoni. Unganisha intaneti. | not reviewed |  |
| `pp.demoBody` | In the real system the owner adds people here, sets their codes and roles, and approves each new phone or laptop with a short matching code. | Dans le vrai système, le propriétaire ajoute ici les personnes, fixe leurs codes et rôles, et approuve chaque nouveau téléphone ou ordinateur avec un code court correspondant. | Kwenye mfumo halisi mmiliki anaongeza watu hapa, anaweka namba na nafasi zao, na kuidhinisha kila simu au kompyuta mpya kwa namba fupi inayolingana. | not reviewed |  |
| `pp.waiting` | Waiting for your approval | En attente de votre approbation | Inasubiri idhini yako | not reviewed |  |
| `pp.onDevice` | on {device} | sur {device} | kwenye {device} | not reviewed |  |
| `pp.asked` | Asked {time} · check the code matches the one on their screen | Demandé le {time} · vérifiez que le code est le même que sur leur écran | Iliombwa {time} · hakikisha namba inalingana na iliyo kwenye skrini yao | not reviewed |  |
| `pp.approved` | Device approved | Appareil approuvé | Kifaa kimeidhinishwa | not reviewed |  |
| `pp.approve` | Approve | Approuver | Idhinisha | not reviewed |  |
| `pp.nDevices` | {n} device(s) | {n} appareil(s) | Vifaa {n} | not reviewed |  |
| `pp.locked` | locked | bloqué | imefungwa | not reviewed |  |
| `pp.devices` | Devices | Appareils | Vifaa | not reviewed |  |
| `pp.blockHint` | Block a lost or stolen phone at once | Bloquez immédiatement un téléphone perdu ou volé | Zuia mara moja simu iliyopotea au kuibiwa | not reviewed |  |
| `pp.code` | Code | Code | Namba | not reviewed |  |
| `pp.thisDevice` | this device | cet appareil | kifaa hiki | not reviewed |  |
| `pp.unblocked` | Device unblocked | Appareil débloqué | Kifaa kimeruhusiwa tena | not reviewed |  |
| `pp.blocked` | Device blocked — its sessions ended | Appareil bloqué — ses sessions sont terminées | Kifaa kimezuiwa — vipindi vyake vimeisha | not reviewed |  |
| `pp.unblock` | Unblock | Débloquer | Ruhusu tena | not reviewed |  |
| `pp.block` | Block | Bloquer | Zuia | not reviewed |  |
| `pp.blockedStatus` | Blocked | Bloqué | Imezuiwa | not reviewed |  |
| `pp.retire` | Retire | Retirer | Staafisha | not reviewed |  |
| `pp.retired` | Retired | Retiré | Imestaafishwa | not reviewed |  |
| `pp.reactivate` | Reactivate | Réactiver | Rudisha kazini | not reviewed |  |
| `pp.retiredDevices` | Retired devices | Appareils retirés | Vifaa vilivyostaafishwa | not reviewed |  |
| `pp.retiredHint` | Old devices, kept for history. They cannot sign in. | Anciens appareils, conservés pour l'historique. Ils ne peuvent pas se connecter. | Vifaa vya zamani, vimehifadhiwa kwa historia. Haviwezi kuingia. | not reviewed |  |
| `pp.retiredToast` | Device retired | Appareil retiré | Kifaa kimestaafishwa | not reviewed |  |
| `pp.reactivatedToast` | Device reactivated | Appareil réactivé | Kifaa kimerudishwa kazini | not reviewed |  |
| `pp.retireTitle` | Retire this device? | Retirer cet appareil ? | Staafisha kifaa hiki? | not reviewed |  |
| `pp.retireBody` | It moves to Retired devices and can no longer sign in. Its history is kept, and you can reactivate it later. | Il passe dans les appareils retirés et ne peut plus se connecter. Son historique est conservé et vous pourrez le réactiver plus tard. | Kitahamia kwenye vifaa vilivyostaafishwa na hakitaweza kuingia tena. Historia yake inahifadhiwa, na unaweza kukirudisha kazini baadaye. | not reviewed |  |
| `pp.reactivateTitle` | Reactivate this device? | Réactiver cet appareil ? | Rudisha kifaa hiki kazini? | not reviewed |  |
| `pp.reactivateBody` | It returns to the active list. The people already approved on it will be able to sign in again. | Il revient dans la liste active. Les personnes déjà autorisées dessus pourront de nouveau se connecter. | Kitarudi kwenye orodha inayotumika. Watu walioruhusiwa tayari juu yake wataweza kuingia tena. | not reviewed |  |
| `pp.addedToast` | {name} added. Give them their code in person. | {name} ajouté(e). Donnez-lui son code en personne. | {name} ameongezwa. Mpe namba yake ana kwa ana. | not reviewed |  |
| `pp.newCode` | New code (leave empty to keep) | Nouveau code (laisser vide pour garder l’actuel) | Namba mpya (acha wazi kubaki na ya sasa) | not reviewed |  |
| `pp.accessCode` | Access code | Code d’accès | Namba ya kuingia | not reviewed |  |
| `pp.codeHint` | {n}–8 digits. Tell them in person; never send it by message. | {n} à 8 chiffres. Donnez-le en personne ; ne l’envoyez jamais par message. | Tarakimu {n}–8. Mwambie ana kwa ana; usiitume kwa ujumbe. | not reviewed |  |
| `pp.allowHere` | Also allow them on this device (shared family laptop) | L’autoriser aussi sur cet appareil (ordinateur familial partagé) | Mruhusu pia kwenye kifaa hiki (kompyuta ya familia) | not reviewed |  |
| `pp.lockedAfter` | Locked after {n} wrong codes. | Bloqué après {n} codes incorrects. | Imefungwa baada ya namba {n} zisizo sahihi. | not reviewed |  |
| `pp.unlocked` | Unlocked | Débloqué | Imefunguliwa | not reviewed |  |
| `pp.unlock` | Unlock | Débloquer | Fungua | not reviewed |  |
| `pp.serverChecks` | The server checks these on every request — hiding a screen is never the only protection. | Le serveur vérifie ces droits à chaque demande — masquer un écran n’est jamais la seule protection. | Seva inakagua haya kila ombi — kuficha skrini si ulinzi pekee. | not reviewed |  |
| `pp.allowedDevices` | Allowed devices | Appareils autorisés | Vifaa vilivyoruhusiwa | not reviewed |  |
| `pp.removed` | Removed | Retiré | Imeondolewa | not reviewed |  |

## 2. Worker day: take, return, close, reopen, sync

Seen by workers every day on their phone. Plain, short words matter most. (114 phrases)

| Key | English | Français | Kiswahili | Status | Correction |
|---|---|---|---|---|---|
| `sync.synced` | Synced | Synchronisé | Imesawazishwa | not reviewed |  |
| `sync.demo` | Demo — this device only | Démo — cet appareil seulement | Majaribio — kifaa hiki tu | not reviewed |  |
| `sync.syncing` | Syncing… | Synchronisation… | Inasawazisha… | not reviewed |  |
| `sync.attention` | {n} need attention | {n} à vérifier | {n} zinahitaji kuangaliwa | not reviewed |  |
| `sync.offlineSaved` | Offline · {n} saved on this device | Hors ligne · {n} enregistré(s) sur cet appareil | Nje ya mtandao · {n} zimehifadhiwa kwenye kifaa | not reviewed |  |
| `sync.offline` | Offline | Hors ligne | Nje ya mtandao | not reviewed |  |
| `sync.waiting` | {n} waiting to sync | {n} en attente d’envoi | {n} zinasubiri kutumwa | not reviewed |  |
| `sync.problem` | Sync problem | Problème de synchronisation | Tatizo la usawazishaji | not reviewed |  |
| `w.notClosed` | {date} is not closed yet. | La journée du {date} n’est pas encore clôturée. | Siku ya {date} bado haijafungwa. | not reviewed |  |
| `w.closeIt` | Close it | La clôturer | Ifunge | not reviewed |  |
| `w.withYou` | With you now | Avec vous | Ulivyo navyo sasa | not reviewed |  |
| `w.pieces` | pieces | pièces | vipande | not reviewed |  |
| `w.todayClosed` | Today closed | Journée clôturée | Leo imefungwa | not reviewed |  |
| `w.outSince` | Out since {time} | Sorti(e) depuis {time} | Nje tangu {time} | not reviewed |  |
| `w.notStarted` | Not started | Pas commencée | Bado haijaanza | not reviewed |  |
| `w.closedTitle` | Today is closed. | La journée est clôturée. | Siku ya leo imefungwa. | not reviewed |  |
| `w.closedBody` | Taking and returning garments start again tomorrow. If something must change today, ask a manager to reopen the day (Sales days → today → Reopen day). | Vous pourrez de nouveau prendre et rendre des vêtements demain. Si quelque chose doit être corrigé aujourd’hui, demandez à un responsable de rouvrir la journée (Journées de vente → aujourd’hui → Rouvrir la journée). | Kuchukua na kurudisha nguo kutaanza tena kesho. Kama kuna kitu lazima kibadilishwe leo, mwombe meneja aifungue siku tena (Siku za mauzo → leo → Fungua siku tena). | not reviewed |  |
| `w.take` | Take garments | Prendre des vêtements | Chukua nguo | not reviewed |  |
| `w.takeSub` | When you pick stock to sell | Quand vous prenez du stock à vendre | Unapochukua mzigo wa kuuza | not reviewed |  |
| `w.return` | Return garments | Rendre des vêtements | Rudisha nguo | not reviewed |  |
| `w.returnSub` | What you bring back | Ce que vous rapportez | Unachorudisha | not reviewed |  |
| `w.closeDay` | Close the day | Clôturer la journée | Funga siku | not reviewed |  |
| `w.closeDaySub` | Money and what was sold | L’argent et ce qui a été vendu | Pesa na kilichouzwa | not reviewed |  |
| `w.todaySoFar` | Today so far | Aujourd’hui | Leo hadi sasa | not reviewed |  |
| `w.nothingToday` | Nothing recorded yet today. | Rien d’enregistré aujourd’hui. | Hakuna kilichorekodiwa leo. | not reviewed |  |
| `w.savedOnPhone` | Saved on this phone | Enregistré sur ce téléphone | Imehifadhiwa kwenye simu hii | not reviewed |  |
| `w.notAccepted` | Not accepted: {error} | Refusé : {error} | Haikukubaliwa: {error} | not reviewed |  |
| `w.wrongCancel` | Wrong? Cancel it | Erreur ? Annuler | Kosa? Ighairi | not reviewed |  |
| `w.whyPlaceholder` | Why? e.g. typed 50 not 40 | Pourquoi ? ex. tapé 50 au lieu de 40 | Kwa nini? mf. niliandika 50 badala ya 40 | not reviewed |  |
| `w.cancelRecord` | Cancel record | Annuler l’enregistrement | Ghairi kumbukumbu | not reviewed |  |
| `w.cancelledToast` | Cancelled — enter it again correctly | Annulé — saisissez-le de nouveau correctement | Imeghairiwa — iandike tena kwa usahihi | not reviewed |  |
| `w.dayBalanced` | Day closed — balanced | Journée clôturée — caisse juste | Siku imefungwa — imelingana | not reviewed |  |
| `w.dayShort` | Day closed — short | Journée clôturée — il manque de l’argent | Siku imefungwa — pesa imepungua | not reviewed |  |
| `w.dayOver` | Day closed — over | Journée clôturée — excédent | Siku imefungwa — pesa imezidi | not reviewed |  |
| `w.managerQuestion` | Question from manager | Question du responsable | Swali kutoka kwa meneja | not reviewed |  |
| `w.salesValue` | Sales value | Montant des ventes | Thamani ya mauzo | not reviewed |  |
| `w.difference` | Difference | Écart | Tofauti | not reviewed |  |
| `w.managerSays` | Manager: “{note}” | Responsable : « {note} » | Meneja: “{note}” | not reviewed |  |
| `w.yourWork` | Your work | Votre travail | Kazi yako | not reviewed |  |
| `w.noDays` | No days yet | Aucune journée pour l’instant | Bado hakuna siku | not reviewed |  |
| `w.noDaysBody` | Your days appear here after you take garments. | Vos journées apparaîtront ici dès que vous prendrez des vêtements. | Siku zako zitaonekana hapa baada ya kuchukua nguo. | not reviewed |  |
| `w.short` | Short {amount} | Manque {amount} | Upungufu {amount} | not reviewed |  |
| `w.over` | Over {amount} | Excédent {amount} | Ziada {amount} | not reviewed |  |
| `w.took` | Took | Pris | Ulichukua | not reviewed |  |
| `w.back` | Back | Rendus | Ulirudisha | not reviewed |  |
| `sd.recordingFor` | Recording for | Saisie pour | Unarekodi kwa niaba ya | not reviewed |  |
| `sd.noSelling` | No selling location yet | Pas encore de lieu de vente | Bado hakuna mahali pa kuuzia | not reviewed |  |
| `sd.noSellingBody` | The owner needs to add the Comoros location first. | Le propriétaire doit d’abord ajouter le lieu des Comores. | Mmiliki anahitaji kwanza kuongeza mahali pa Komoro. | not reviewed |  |
| `sd.takeLead` | Count the garments in your hands, then save. Save now — not at the end of the day. | Comptez les vêtements que vous avez en main, puis enregistrez. Enregistrez maintenant, pas en fin de journée. | Hesabu nguo ulizoshika, kisha hifadhi. Hifadhi sasa — si mwisho wa siku. | not reviewed |  |
| `sd.search` | Search garments… | Rechercher un vêtement… | Tafuta nguo… | not reviewed |  |
| `sd.noGarments` | No garments found | Aucun vêtement trouvé | Hakuna nguo iliyopatikana | not reviewed |  |
| `sd.noPrice` | no price set | pas de prix | bei haijawekwa | not reviewed |  |
| `sd.worth` | Worth {amount} at full price | Valeur : {amount} au prix de détail | Thamani {amount} kwa bei kamili | not reviewed |  |
| `sd.takenToast` | Saved: {n} pcs taken | Enregistré : {n} pcs prises | Imehifadhiwa: vipande {n} vimechukuliwa | not reviewed |  |
| `sd.returnLead` | Count what you bring back to the store. Whatever is not returned is counted as sold when you close the day. | Comptez ce que vous rapportez au magasin. Tout ce qui n’est pas rendu sera compté comme vendu à la clôture de la journée. | Hesabu unachorudisha stoo. Kisichorudishwa kitahesabiwa kama kimeuzwa utakapofunga siku. | not reviewed |  |
| `sd.nothingReturn` | Nothing to return | Rien à rendre | Hakuna cha kurudisha | not reviewed |  |
| `sd.nothingReturnBody` | You are not holding any garments right now. | Vous n’avez aucun vêtement en main pour le moment. | Huna nguo yoyote kwa sasa. | not reviewed |  |
| `sd.youHold` | You hold {n} | Vous en avez {n} | Una {n} | not reviewed |  |
| `sd.all` | All | Tout | Zote | not reviewed |  |
| `sd.nBack` | {n} pcs back | {n} pcs rendues | vipande {n} vimerudi | not reviewed |  |
| `sd.returnedToast` | Saved: {n} pcs returned | Enregistré : {n} pcs rendues | Imehifadhiwa: vipande {n} vimerudishwa | not reviewed |  |
| `sd.alreadyClosed` | Day already closed | Journée déjà clôturée | Siku tayari imefungwa | not reviewed |  |
| `sd.alreadyClosedLead` | {date} was closed. A manager can reopen it if something must change. | La journée du {date} est clôturée. Un responsable peut la rouvrir si quelque chose doit être corrigé. | Siku ya {date} imefungwa. Meneja anaweza kuifungua tena kama kuna kitu cha kubadilisha. | not reviewed |  |
| `sd.closeLead` | Everything you still hold is counted as sold, unless you mark it as kept for tomorrow or lost. | Tout ce que vous avez encore en main est compté comme vendu, sauf si vous l’indiquez comme gardé pour demain ou perdu. | Kila kitu ulichobaki nacho kinahesabiwa kama kimeuzwa, isipokuwa ukiweka alama kuwa kimebaki kwa kesho au kimepotea. | not reviewed |  |
| `sd.step1` | 1 · What was sold | 1 · Ce qui a été vendu | 1 · Kilichouzwa | not reviewed |  |
| `sd.holdNone` | You hold no garments. You can still close the day to hand over money. | Vous n’avez aucun vêtement en main. Vous pouvez quand même clôturer la journée pour remettre l’argent. | Huna nguo yoyote. Bado unaweza kufunga siku ili kukabidhi pesa. | not reviewed |  |
| `sd.soldOf` | {sold} of {held} sold | {sold} vendus sur {held} | {sold} kati ya {held} vimeuzwa | not reviewed |  |
| `sd.each` | {amount} each | {amount} l’unité | {amount} kila kimoja | not reviewed |  |
| `sd.noPriceAsk` | No price set — ask a manager | Pas de prix — demandez à un responsable | Bei haijawekwa — muulize meneja | not reviewed |  |
| `sd.nWholesale` | {n} wholesale | {n} en gros | {n} jumla | not reviewed |  |
| `sd.nKept` | {n} kept | {n} gardés | {n} vimebaki | not reviewed |  |
| `sd.nLost` | {n} lost | {n} perdus | {n} vimepotea | not reviewed |  |
| `sd.detailToggle` | Wholesale / kept / lost | En gros / gardés / perdus | Jumla / vimebaki / vimepotea | not reviewed |  |
| `sd.soldWholesale` | Sold at wholesale price | Vendus au prix de gros | Vimeuzwa kwa bei ya jumla | not reviewed |  |
| `sd.wholesaleEach` | Wholesale price each | Prix de gros à l’unité | Bei ya jumla kwa kimoja | not reviewed |  |
| `sd.kept` | Kept for tomorrow | Gardés pour demain | Vimebaki kwa kesho | not reviewed |  |
| `sd.lost` | Lost or damaged | Perdus ou abîmés | Vimepotea au kuharibika | not reviewed |  |
| `sd.step2` | 2 · Money spent from the sales | 2 · Argent dépensé sur les ventes | 2 · Pesa iliyotumika kutoka kwenye mauzo | not reviewed |  |
| `sd.nothingSpent` | Nothing spent. | Aucune dépense. | Hakuna kilichotumika. | not reviewed |  |
| `sd.whatFor` | What for | Pour quoi | Kwa ajili ya nini | not reviewed |  |
| `sd.whatForPh` | e.g. transport | ex. transport | mf. usafiri | not reviewed |  |
| `sd.amount` | Amount | Montant | Kiasi | not reviewed |  |
| `sd.step3` | 3 · Money handed over | 3 · Argent remis | 3 · Pesa iliyokabidhiwa | not reviewed |  |
| `sd.cash` | Cash | Espèces | Taslimu | not reviewed |  |
| `sd.mobile` | Mobile money (if any) | Mobile money (le cas échéant) | Pesa ya simu (kama ipo) | not reviewed |  |
| `sd.salesAtPrices` | Sales at recorded prices | Ventes aux prix enregistrés | Mauzo kwa bei zilizorekodiwa | not reviewed |  |
| `sd.spentFromSales` | Spent from sales | Dépensé sur les ventes | Iliyotumika kutoka mauzo | not reviewed |  |
| `sd.shortBy` | Short by | Il manque | Upungufu wa | not reviewed |  |
| `sd.overBy` | Over by | Excédent de | Ziada ya | not reviewed |  |
| `sd.explain` | Explain the difference | Expliquez l’écart | Eleza tofauti | not reviewed |  |
| `sd.noteOptional` | Note (optional) | Remarque (facultatif) | Maelezo (si lazima) | not reviewed |  |
| `sd.explainPh` | e.g. gave a discount, wrong change… | ex. remise accordée, erreur de monnaie… | mf. nilitoa punguzo, chenji isiyo sahihi… | not reviewed |  |
| `sd.missingPrice` | Some garments have no selling price. A manager must set prices before this day can be closed. | Certains vêtements n’ont pas de prix de vente. Un responsable doit fixer les prix avant la clôture de cette journée. | Baadhi ya nguo hazina bei ya kuuzia. Meneja lazima aweke bei kabla siku hii haijafungwa. | not reviewed |  |
| `sd.explainFirst` | Please explain the difference before closing. | Expliquez l’écart avant de clôturer. | Tafadhali eleza tofauti kabla ya kufunga. | not reviewed |  |
| `sd.closedToast` | Day closed | Journée clôturée | Siku imefungwa | not reviewed |  |
| `sd.kmfNote` | Amounts are saved in official KMF. The local count (÷5) is only shown to help you count. | Les montants sont enregistrés en KMF officiels. Le compte local (÷5) est affiché seulement pour vous aider à compter. | Kiasi kinahifadhiwa kwa KMF rasmi. Hesabu ya kienyeji (÷5) inaonyeshwa tu kukusaidia kuhesabu. | not reviewed |  |
| `me.waitingCount` | Saved on this device, waiting | Enregistrés sur cet appareil, en attente | Zimehifadhiwa kwenye kifaa, zinasubiri | not reviewed |  |
| `me.storage` | Storage protected from clean-up | Stockage protégé contre le nettoyage | Hifadhi imelindwa isifutwe | not reviewed |  |
| `me.storageNo` | No — install the app | Non — installez l’application | Hapana — sakinisha programu | not reviewed |  |
| `me.storageWarn` | This browser has not promised to keep Mabubu’s data on this device. If it is cleared, this device must be approved again (records already sent are safe). Using the installed app in a normal window helps. | Ce navigateur n’a pas promis de garder les données de Mabubu sur cet appareil. Si elles sont effacées, cet appareil devra être approuvé à nouveau (les données déjà envoyées sont en sécurité). Utiliser l’application installée dans une fenêtre normale aide. | Kivinjari hiki hakijaahidi kuhifadhi data ya Mabubu kwenye kifaa hiki. Ikifutwa, kifaa hiki kitahitaji kuidhinishwa tena (kumbukumbu zilizokwisha tumwa ziko salama). Kutumia programu iliyosakinishwa katika dirisha la kawaida husaidia. | not reviewed |  |
| `me.waiting` | Waiting to sync | En attente d’envoi | Zinasubiri kutumwa | not reviewed |  |
| `me.rejected` | Not accepted by the server | Refusés par le serveur | Hazikukubaliwa na seva | not reviewed |  |
| `void.cancelRecord` | Cancel record | Annuler l’enregistrement | Ghairi kumbukumbu | not reviewed |  |
| `void.cancel` | Cancel | Annuler | Ghairi | not reviewed |  |
| `void.title` | Cancel this record? | Annuler cet enregistrement ? | Ghairi kumbukumbu hii? | not reviewed |  |
| `void.keep` | Keep it | Le garder | Iache | not reviewed |  |
| `void.done` | Record cancelled | Enregistrement annulé | Kumbukumbu imeghairiwa | not reviewed |  |
| `void.explain` | The record stays in the activity log, marked as cancelled. Its effect on stock and money is reversed. Enter the correct record afterwards if needed. | L’enregistrement reste dans le journal d’activité, marqué comme annulé. Son effet sur le stock et l’argent est annulé. Saisissez ensuite l’enregistrement correct si nécessaire. | Kumbukumbu inabaki kwenye kumbukumbu za shughuli ikiwa imewekwa alama ya kughairiwa. Athari yake kwa stoo na pesa inarudishwa. Andika kumbukumbu sahihi baadaye ikihitajika. | not reviewed |  |
| `void.reason` | Reason (required) | Motif (obligatoire) | Sababu (lazima) | not reviewed |  |
| `void.reasonPh` | e.g. typed 500 instead of 50 | ex. tapé 500 au lieu de 50 | mf. niliandika 500 badala ya 50 | not reviewed |  |
| `void.reopen` | Reopen day | Rouvrir la journée | Fungua siku tena | not reviewed |  |
| `void.reopenTitle` | Reopen this day? | Rouvrir cette journée ? | Fungua siku hii tena? | not reviewed |  |
| `void.reopenExplain` | The closing stays in the activity log with your reason. The day opens again so the worker can take, return and close it again. | La clôture reste dans le journal d’activité avec votre motif. La journée est rouverte : le vendeur peut de nouveau prendre, rendre et la clôturer. | Ufungaji unabaki kwenye kumbukumbu pamoja na sababu yako. Siku inafunguliwa tena ili mfanyakazi aweze kuchukua, kurudisha na kuifunga tena. | not reviewed |  |
| `void.reopened` | Day reopened | Journée rouverte | Siku imefunguliwa tena | not reviewed |  |

## 3. Money and report terms

Seen by the owner and managers: profit, costs, rates, balances. (113 phrases)

| Key | English | Français | Kiswahili | Status | Correction |
|---|---|---|---|---|---|
| `fx.title` | Add exchange rate | Ajouter un taux de change | Ongeza kiwango cha ubadilishaji | not reviewed |  |
| `fx.saved` | Rate saved | Taux enregistré | Kiwango kimehifadhiwa | not reviewed |  |
| `fx.save` | Save rate | Enregistrer le taux | Hifadhi kiwango | not reviewed |  |
| `fx.unitOf` | 1 unit of | 1 unité de | Kipimo 1 cha | not reviewed |  |
| `fx.equals` | equals | vaut | ni sawa na | not reviewed |  |
| `fx.of` | of | en | cha | not reviewed |  |
| `fx.eg` | e.g. 3.45 | ex. 3.45 | mf. 3.45 | not reviewed |  |
| `fx.validFrom` | Valid from | Valable à partir du | Inatumika kuanzia | not reviewed |  |
| `fx.where` | Where the rate came from | Origine du taux | Kiwango kimetoka wapi | not reviewed |  |
| `fx.whereHint` | e.g. bureau in Moroni, M-Pesa, bank | ex. bureau de change à Moroni, M-Pesa, banque | mf. duka la kubadilisha fedha Moroni, M-Pesa, benki | not reviewed |  |
| `fx.kindQ` | What kind of rate is it? | De quel type de taux s’agit-il ? | Ni kiwango cha aina gani? | not reviewed |  |
| `fx.really` | We really got this rate | Nous avons réellement obtenu ce taux | Tulipata kiwango hiki kweli | not reviewed |  |
| `fx.reference` | A reference figure | Un chiffre de référence | Kiwango cha marejeo | not reviewed |  |
| `fx.hint` | The rate actually received when money was changed is the best figure for profit. Reports show which kind each rate is. | Le taux réellement obtenu lors du change est le meilleur chiffre pour le bénéfice. Les rapports indiquent le type de chaque taux. | Kiwango kilichopatikana kweli pesa ilipobadilishwa ndicho bora kwa faida. Ripoti zinaonyesha aina ya kila kiwango. | not reviewed |  |
| `acct.location` | location | lieu | mahali | not reviewed |  |
| `acct.avail` | Available at {place} | Disponible à {place} | Inapatikana {place} | not reviewed |  |
| `acct.worker` | Held by {name} ({place}) | Chez {name} ({place}) | Kwa {name} ({place}) | not reviewed |  |
| `acct.transit` | In transit ({code}) | En transit ({code}) | Njiani ({code}) | not reviewed |  |
| `acct.await` | Waiting for collection at {place} | En attente de récupération à {place} | Inasubiri kuchukuliwa {place} | not reviewed |  |
| `acct.insp` | Waiting for inspection at {place} | En attente de contrôle à {place} | Inasubiri ukaguzi {place} | not reviewed |  |
| `acct.rej` | Rejected at {place} | Refusé à {place} | Imekataliwa {place} | not reviewed |  |
| `acct.sold` | Sold at {place} | Vendu à {place} | Imeuzwa {place} | not reviewed |  |
| `acct.adj` | Adjustments at {place} | Corrections à {place} | Marekebisho {place} | not reviewed |  |
| `acct.vendor` | Vendor {name} | Fournisseur {name} | Muuzaji {name} | not reviewed |  |
| `conv.transaction` | Recorded rate in force on each transaction’s date | Taux enregistré en vigueur à la date de chaque opération | Kiwango kilichorekodiwa kilichotumika tarehe ya kila muamala | not reviewed |  |
| `conv.market` | Today’s market reference rate (current value, not historical cost) | Taux de référence du marché du jour (valeur actuelle, pas le coût historique) | Kiwango cha soko cha leo (thamani ya sasa, si gharama ya zamani) | not reviewed |  |
| `rp.period.month` | This month | Ce mois-ci | Mwezi huu | not reviewed |  |
| `rp.period.last` | Last month | Le mois dernier | Mwezi uliopita | not reviewed |  |
| `rp.period.30` | Last 30 days | 30 derniers jours | Siku 30 zilizopita | not reviewed |  |
| `rp.period.custom` | Custom | Personnalisé | Maalum | not reviewed |  |
| `rp.lead` | {from} – {to} · {place}. Sales are not profit: the lines below show each cost taken away. | {from} – {to} · {place}. Les ventes ne sont pas le bénéfice : les lignes ci-dessous montrent chaque coût déduit. | {from} – {to} · {place}. Mauzo si faida: mistari hapa chini inaonyesha kila gharama iliyotolewa. | not reviewed |  |
| `rp.allPlaces` | all places | tous les lieux | mahali pote | not reviewed |  |
| `rp.currency` | Report currency | Devise du rapport | Sarafu ya ripoti | not reviewed |  |
| `rp.showIn` | Show in {currency} | Afficher en {currency} | Onyesha kwa {currency} | not reviewed |  |
| `rp.convertWith` | Convert with | Convertir avec | Badilisha kwa | not reviewed |  |
| `rp.recorded` | Recorded rates (cost) | Taux enregistrés (coût) | Viwango vilivyorekodiwa (gharama) | not reviewed |  |
| `rp.marketNow` | Today’s market (value now) | Marché du jour (valeur actuelle) | Soko la leo (thamani ya sasa) | not reviewed |  |
| `rp.marketStale` | Market rates may be out of date. | Les taux du marché sont peut-être dépassés. | Viwango vya soko huenda vimepitwa na wakati. | not reviewed |  |
| `rp.usingMarket` | Using market reference rates published {time}. This shows what the amounts are worth at today’s rates; it is not the historical cost, and past profit is not rewritten. | Taux de référence du marché publiés le {time}. Cela montre la valeur des montants aux taux du jour ; ce n’est pas le coût historique, et le bénéfice passé n’est pas réécrit. | Inatumia viwango vya soko vilivyochapishwa {time}. Hii inaonyesha thamani ya kiasi kwa viwango vya leo; si gharama ya zamani, na faida ya zamani haiandikwi upya. | not reviewed |  |
| `rp.noMarket` | No market rates on this device yet{error}. Amounts in other currencies are left out until rates load. | Pas encore de taux du marché sur cet appareil{error}. Les montants dans d’autres devises sont exclus jusqu’au chargement des taux. | Bado hakuna viwango vya soko kwenye kifaa hiki{error}. Kiasi cha sarafu nyingine kinaachwa hadi viwango vipakie. | not reviewed |  |
| `rp.incomplete` | Incomplete — do not use these totals as the final profit. | Incomplet — n’utilisez pas ces totaux comme bénéfice final. | Haijakamilika — usitumie jumla hizi kama faida ya mwisho. | not reviewed |  |
| `rp.noRate` | No exchange rate for {list}{more}: those amounts are left out. | Pas de taux de change pour {list}{more} : ces montants sont exclus. | Hakuna kiwango cha ubadilishaji kwa {list}{more}: kiasi hicho kimeachwa. | not reviewed |  |
| `rp.andMore` |  and {n} more |  et {n} de plus |  na {n} zaidi | not reviewed |  |
| `rp.addRates` | Add rates in {settings} or the {converter}. | Ajoutez des taux dans {settings} ou le {converter}. | Ongeza viwango kwenye {settings} au {converter}. | not reviewed |  |
| `rp.noCost` | No purchase cost known for {list}. | Aucun coût d’achat connu pour {list}. | Hakuna gharama ya kununua inayojulikana kwa {list}. | not reviewed |  |
| `rp.neverGuess` | The app never guesses a rate. | L’application ne devine jamais un taux. | Programu haikisii kiwango kamwe. | not reviewed |  |
| `rp.profit` | Profit for the period | Bénéfice de la période | Faida ya kipindi | not reviewed |  |
| `rp.salesValue` | Sales value ({pieces} pieces, {days} closed day(s)) | Montant des ventes ({pieces} pièces, {days} journée(s) clôturée(s)) | Thamani ya mauzo (vipande {pieces}, siku {days} zilizofungwa) | not reviewed |  |
| `rp.cogs` | − Cost of those garments (purchase price only) | − Coût de ces vêtements (prix d’achat seulement) | − Gharama ya nguo hizo (bei ya kununua tu) | not reviewed |  |
| `rp.gross` | Gross margin | Marge brute | Faida ghafi | not reviewed |  |
| `rp.cashDiff` | − Cash short (+) / over (−) from sales days | − Manque (+) / excédent (−) de caisse des journées de vente | − Upungufu (+) / ziada (−) ya pesa kutoka siku za mauzo | not reviewed |  |
| `rp.workerExp` | − Spent by workers from sales | − Dépensé par les vendeurs sur les ventes | − Iliyotumika na wafanyakazi kutoka mauzo | not reviewed |  |
| `rp.shipCosts` | − Shipment costs | − Frais d’envoi | − Gharama za mizigo | not reviewed |  |
| `rp.otherExp` | − Other expenses | − Autres dépenses | − Matumizi mengine | not reviewed |  |
| `rp.net` | Net for the period | Résultat net de la période | Faida halisi ya kipindi | not reviewed |  |
| `rp.netIncomplete` | Net (incomplete) | Net (incomplet) | Halisi (haijakamilika) | not reviewed |  |
| `rp.noClosed` | No closed sales days in this period{at}, so there is no sales value. Costs dated in the period still count. | Aucune journée de vente clôturée sur cette période{at} : il n’y a donc pas de montant des ventes. Les coûts datés de la période comptent quand même. | Hakuna siku za mauzo zilizofungwa katika kipindi hiki{at}, hivyo hakuna thamani ya mauzo. Gharama za tarehe za kipindi bado zinahesabiwa. | not reviewed |  |
| `rp.atPlace` |  at {place} |  à {place} |  {place} | not reviewed |  |
| `rp.estimates` | Includes {amount} of shipment costs that are still estimates. | Comprend {amount} de frais d’envoi encore estimés. | Inajumuisha {amount} ya gharama za mizigo ambazo bado ni makadirio. | not reviewed |  |
| `rp.how` | How these numbers are worked out | Comment ces chiffres sont calculés | Jinsi namba hizi zinavyohesabiwa | not reviewed |  |
| `rp.how1` | Sales value counts only closed sales days dated in the period, at the prices recorded when each day was closed. | Le montant des ventes ne compte que les journées clôturées datées de la période, aux prix enregistrés à la clôture de chaque journée. | Thamani ya mauzo inahesabu siku za mauzo zilizofungwa za kipindi tu, kwa bei zilizorekodiwa kila siku ilipofungwa. | not reviewed |  |
| `rp.how2` | Garment cost = pieces sold × the average purchase price of that garment type (accepted pieces only). Each purchase is converted with the rate in force on its own date. | Coût des vêtements = pièces vendues × prix d’achat moyen de ce type de vêtement (pièces acceptées seulement). Chaque achat est converti au taux en vigueur à sa date. | Gharama ya nguo = vipande vilivyouzwa × wastani wa bei ya kununua ya aina hiyo (vipande vilivyokubaliwa tu). Kila manunuzi yanabadilishwa kwa kiwango cha tarehe yake. | not reviewed |  |
| `rp.how3` | Limitation: this is not a full landed cost per garment. Shipment costs and expenses are counted in the period they are dated, not spread over the pieces they carried, so the margin of a single garment type does not include its transport. | Limite : ce n’est pas un coût complet rendu par vêtement. Les frais d’envoi et dépenses sont comptés dans la période de leur date, sans être répartis sur les pièces transportées ; la marge d’un type de vêtement n’inclut donc pas son transport. | Kikomo: hii si gharama kamili ya kufikisha kwa kila nguo. Gharama za mizigo na matumizi zinahesabiwa katika kipindi cha tarehe zake, hazigawanywi kwa vipande vilivyobebwa, hivyo faida ya aina moja ya nguo haijumuishi usafiri wake. | not reviewed |  |
| `rp.how4` | Every amount stays saved in the currency it was paid in; “as paid” under each line shows those original amounts, so the conversion can be checked. | Chaque montant reste enregistré dans la devise payée ; « tel que payé » sous chaque ligne montre ces montants d’origine pour vérifier la conversion. | Kila kiasi kinabaki kimehifadhiwa kwa sarafu kilicholipwa; “kama ilivyolipwa” chini ya kila mstari inaonyesha kiasi asili, ili ubadilishaji uhakikiwe. | not reviewed |  |
| `rp.asPaid` | as paid: {list} | tel que payé : {list} | kama ilivyolipwa: {list} | not reviewed |  |
| `rp.ratesUsed` | Exchange rates used | Taux de change utilisés | Viwango vya ubadilishaji vilivyotumika | not reviewed |  |
| `rp.noneAvail` | None available. | Aucun disponible. | Hakuna kinachopatikana. | not reviewed |  |
| `rp.noConversion` | No conversion needed — everything was already in {currency}. | Aucune conversion nécessaire — tout était déjà en {currency}. | Hakuna haja ya kubadilisha — kila kitu kilikuwa tayari kwa {currency}. | not reviewed |  |
| `rp.publishedOn` | published {date} | publié le {date} | ilichapishwa {date} | not reviewed |  |
| `rp.sinceDate` | since {date} | depuis le {date} | tangu {date} | not reviewed |  |
| `rp.byKind` | Costs by kind | Coûts par type | Gharama kwa aina | not reviewed |  |
| `rp.noCosts` | No costs in this period. | Aucun coût sur cette période. | Hakuna gharama katika kipindi hiki. | not reviewed |  |
| `rp.byGarment` | By garment | Par vêtement | Kwa nguo | not reviewed |  |
| `rp.garmentCost` | Garment cost | Coût des vêtements | Gharama ya nguo | not reviewed |  |
| `rp.margin` | Margin | Marge | Faida | not reviewed |  |
| `rp.avgCost` | Avg cost / piece | Coût moyen / pièce | Wastani wa gharama / kipande | not reviewed |  |
| `rp.noClosedSales` | No closed sales in this period{at}. | Aucune vente clôturée sur cette période{at}. | Hakuna mauzo yaliyofungwa katika kipindi hiki{at}. | not reviewed |  |
| `rp.downloads` | Downloads | Téléchargements | Upakuaji | not reviewed |  |
| `rp.downloadsHint` | PDF to read or share, Excel or CSV for a spreadsheet. Each page also has its own Download button that follows the filters chosen there. | PDF pour lire ou partager, Excel ou CSV pour un tableur. Chaque page a aussi son propre bouton Télécharger qui suit les filtres choisis. | PDF kusoma au kushiriki, Excel au CSV kwa jedwali. Kila ukurasa pia una kitufe chake cha Pakua kinachofuata vichujio vilivyochaguliwa hapo. | not reviewed |  |
| `rp.downloadsPlace` |  These use the place filter that is on now. |  Ceux-ci utilisent le filtre de lieu actif. |  Hizi zinatumia kichujio cha mahali kilichowashwa sasa. | not reviewed |  |
| `rp.openPage` | open page | ouvrir la page | fungua ukurasa | not reviewed |  |
| `rp.dl.purchases` | All purchases | Tous les achats | Manunuzi yote | not reviewed |  |
| `rp.dl.vendors` | Vendors, balances and payments | Fournisseurs, soldes et paiements | Wauzaji, madeni na malipo | not reviewed |  |
| `rp.dl.stock` | Stock now | Stock actuel | Stoo ya sasa | not reviewed |  |
| `rp.dl.movements` | Stock movements, last 30 days | Mouvements de stock, 30 derniers jours | Mienendo ya stoo, siku 30 zilizopita | not reviewed |  |
| `rp.dl.shipments` | All shipments with costs | Tous les envois avec frais | Mizigo yote pamoja na gharama | not reviewed |  |
| `rp.dl.expenses` | Expenses, last 30 days | Dépenses, 30 derniers jours | Matumizi, siku 30 zilizopita | not reviewed |  |
| `rp.dl.catalogue` | Garments and selling prices | Vêtements et prix de vente | Nguo na bei za kuuza | not reviewed |  |
| `rp.dl.activity` | Activity log, last 30 days | Journal d’activité, 30 derniers jours | Kumbukumbu za shughuli, siku 30 zilizopita | not reviewed |  |
| `vd.lead` | Who we buy from, and what we owe each of them. | Chez qui nous achetons, et ce que nous devons à chacun. | Tunaonunua kwao, na tunachodaiwa na kila mmoja. | not reviewed |  |
| `vd.add` | Add vendor | Ajouter un fournisseur | Ongeza muuzaji | not reviewed |  |
| `vd.none` | No vendors yet | Aucun fournisseur pour l’instant | Bado hakuna wauzaji | not reviewed |  |
| `vd.inactive` | inactive | inactif | haitumiki | not reviewed |  |
| `vd.lastPurchase` |  · last purchase {date} |  · dernier achat le {date} |  · manunuzi ya mwisho {date} | not reviewed |  |
| `vd.weOweAmt` | We owe {amount} | Nous devons {amount} | Tunadaiwa {amount} | not reviewed |  |
| `vd.creditAmt` | Credit {amount} | Crédit {amount} | Salio letu {amount} | not reviewed |  |
| `vd.edit` | Edit vendor | Modifier le fournisseur | Hariri muuzaji | not reviewed |  |
| `vd.saved` | Vendor saved | Fournisseur enregistré | Muuzaji amehifadhiwa | not reviewed |  |
| `vd.namePh` | e.g. Mama Yasmin | ex. Mama Yasmin | mf. Mama Yasmin | not reviewed |  |
| `vd.phone` | Phone (optional) | Téléphone (facultatif) | Simu (si lazima) | not reviewed |  |
| `vd.notes` | What they sell / notes | Ce qu’il vend / remarques | Wanachouza / maelezo | not reviewed |  |
| `vd.stillBuying` | Still buying from this vendor | Nous achetons encore chez ce fournisseur | Bado tunanunua kwa muuzaji huyu | not reviewed |  |
| `vd.paidFor` | Paid for: {list} | Payé pour : {list} | Imelipia: {list} | not reviewed |  |
| `vd.purchaseOn` | {date} purchase ({amount}) | achat du {date} ({amount}) | manunuzi ya {date} ({amount}) | not reviewed |  |
| `vd.credit` | Not applied to a purchase yet — kept as credit | Pas encore appliqué à un achat — gardé en crédit | Bado haijatumika kwa manunuzi — imebaki kama salio letu | not reviewed |  |
| `vd.notFound` | Vendor not found | Fournisseur introuvable | Muuzaji hakupatikana | not reviewed |  |
| `vd.back` | ← Vendors | ← Fournisseurs | ← Wauzaji | not reviewed |  |
| `vd.ourCredit` | Our credit | Notre crédit | Salio letu | not reviewed |  |
| `vd.boughtPaid` | bought {bought} · paid {paid} | acheté {bought} · payé {paid} | tumenunua {bought} · tumelipa {paid} | not reviewed |  |
| `vd.unapplied` | {amount} not yet applied to a purchase | {amount} pas encore appliqué à un achat | {amount} bado haijatumika kwa manunuzi | not reviewed |  |
| `vd.noneYet` | None yet. | Aucun pour l’instant. | Bado hakuna. | not reviewed |  |
| `vd.payments` | Payments | Paiements | Malipo | not reviewed |  |
| `vd.paymentsHint` | A payment not tied to one purchase pays the oldest unpaid purchase first. | Un paiement non lié à un achat paie d’abord l’achat impayé le plus ancien. | Malipo yasiyohusishwa na manunuzi moja yanalipa kwanza manunuzi ya zamani zaidi yasiyolipwa. | not reviewed |  |

## 4. Warnings and error messages

Shown when something is refused or goes wrong. (88 phrases)

| Key | English | Français | Kiswahili | Status | Correction |
|---|---|---|---|---|---|
| `err.dayClosed` | This day is already closed. Ask a manager to reopen it. | Cette journée est déjà clôturée. Demandez à un responsable de la rouvrir. | Siku hii tayari imefungwa. Mwombe meneja aifungue tena. | not reviewed |  |
| `err.otherLocation` | This day was started at another location, not {place}. | Cette journée a commencé dans un autre lieu, pas à {place}. | Siku hii ilianzia mahali pengine, si {place}. | not reviewed |  |
| `err.noPrice` | {label}: no selling price set. | {label} : aucun prix de vente. | {label}: bei ya kuuzia haijawekwa. | not reviewed |  |
| `err.wholesalePrice` | {label}: enter the wholesale price. | {label} : saisissez le prix de gros. | {label}: weka bei ya jumla. | not reviewed |  |
| `err.heldSum` | {label}: sold + kept + lost must equal the {n} held. | {label} : vendus + gardés + perdus doit être égal aux {n} en main. | {label}: vilivyouzwa + vilivyobaki + vilivyopotea lazima viwe sawa na {n} ulivyo navyo. | not reviewed |  |
| `err.wholesaleMore` | {label}: wholesale pieces cannot be more than pieces sold. | {label} : les pièces en gros ne peuvent pas dépasser les pièces vendues. | {label}: vipande vya jumla haviwezi kuzidi vilivyouzwa. | not reviewed |  |
| `err.negative` | Quantity cannot be negative. | La quantité ne peut pas être négative. | Idadi haiwezi kuwa chini ya sifuri. | not reviewed |  |
| `err.salesCurrency` | Sales at {place} are recorded in {currency}. | Les ventes à {place} sont enregistrées en {currency}. | Mauzo {place} yanarekodiwa kwa {currency}. | not reviewed |  |
| `err.notSignedIn` | Not signed in. | Vous n’êtes pas connecté. | Hujaingia. | not reviewed |  |
| `err.invalid` | Invalid entry. | Saisie non valide. | Ingizo si sahihi. | not reviewed |  |
| `err.noServer` | No connection to the server. | Pas de connexion au serveur. | Hakuna muunganisho na seva. | not reviewed |  |
| `err.wrongCodeLocal` | Wrong code. {n} tries left on this device. | Code incorrect. Encore {n} essai(s) sur cet appareil. | Namba si sahihi. Majaribio {n} yamebaki kwenye kifaa hiki. | not reviewed |  |
| `err.tooManyLocal` | Too many wrong codes. Connect to the internet and sign in again. | Trop de codes incorrects. Connectez-vous à internet et reconnectez-vous. | Namba zisizo sahihi zimezidi. Unganisha intaneti na uingie tena. | not reviewed |  |
| `err.noMatch` | That name and code do not match. | Ce nom et ce code ne correspondent pas. | Jina na namba hiyo havilingani. | not reviewed |  |
| `err.enterNameCode` | Enter your name and your 4–8 digit code. | Saisissez votre nom et votre code de 4 à 8 chiffres. | Weka jina lako na namba yako ya tarakimu 4–8. | not reviewed |  |
| `err.networkLimit` | Too many wrong attempts from this network. Try again in an hour. | Trop d’essais incorrects depuis ce réseau. Réessayez dans une heure. | Majaribio mengi yasiyo sahihi kutoka mtandao huu. Jaribu tena baada ya saa moja. | not reviewed |  |
| `err.locked` | This account is locked after too many wrong codes. Ask the owner to unlock it. | Ce compte est bloqué après trop de codes incorrects. Demandez au propriétaire de le débloquer. | Akaunti hii imefungwa baada ya namba nyingi zisizo sahihi. Mwombe mmiliki aifungue. | not reviewed |  |
| `err.nowLocked` | This account is now locked. Ask the owner to unlock it. | Ce compte est maintenant bloqué. Demandez au propriétaire de le débloquer. | Akaunti hii sasa imefungwa. Mwombe mmiliki aifungue. | not reviewed |  |
| `err.wait` | Too many wrong codes. Wait before trying again. | Trop de codes incorrects. Patientez avant de réessayer. | Namba nyingi zisizo sahihi. Subiri kabla ya kujaribu tena. | not reviewed |  |
| `err.waitMinutes` | Too many wrong codes. Try again in {n} minutes. | Trop de codes incorrects. Réessayez dans {n} minutes. | Namba nyingi zisizo sahihi. Jaribu tena baada ya dakika {n}. | not reviewed |  |
| `err.switchedOff` | This account is switched off. Ask the owner. | Ce compte est désactivé. Adressez-vous au propriétaire. | Akaunti hii imezimwa. Muulize mmiliki. | not reviewed |  |
| `err.deviceBlocked` | This device was blocked by the owner. | Cet appareil a été bloqué par le propriétaire. | Kifaa hiki kimezuiwa na mmiliki. | not reviewed |  |
| `err.deviceNotAllowed` | The owner has not allowed this device for you. | Le propriétaire n’a pas autorisé cet appareil pour vous. | Mmiliki hajaruhusu kifaa hiki kwa ajili yako. | not reviewed |  |
| `err.deviceUnknown` | This device is not recognised. Reset the app on this device and sign in again. | Cet appareil n’est pas reconnu. Réinitialisez l’application sur cet appareil et reconnectez-vous. | Kifaa hiki hakitambuliki. Weka upya programu kwenye kifaa hiki na uingie tena. | not reviewed |  |
| `err.signIn` | Please sign in. | Veuillez vous connecter. | Tafadhali ingia. | not reviewed |  |
| `err.sessionEnded` | Your session has ended. Please sign in again. | Votre session a expiré. Veuillez vous reconnecter. | Muda wako umeisha. Tafadhali ingia tena. | not reviewed |  |
| `err.deviceNoLonger` | This device is no longer allowed. Ask the owner. | Cet appareil n’est plus autorisé. Adressez-vous au propriétaire. | Kifaa hiki hakiruhusiwi tena. Muulize mmiliki. | not reviewed |  |
| `err.setupKey` | The setup key is not correct. | La clé de configuration n’est pas correcte. | Ufunguo wa usanidi si sahihi. | not reviewed |  |
| `err.setupFill` | Fill in the setup key, your name and a code. | Saisissez la clé de configuration, votre nom et un code. | Jaza ufunguo wa usanidi, jina lako na namba. | not reviewed |  |
| `err.setupDone` | Setup is already done. For recovery, enter the existing owner’s name. | La configuration est déjà faite. Pour une récupération, saisissez le nom du propriétaire existant. | Usanidi tayari umefanyika. Kwa kurejesha, weka jina la mmiliki aliyepo. | not reviewed |  |
| `err.workDayNotFound` | Work day not found. | Journée de travail introuvable. | Siku ya kazi haikupatikana. | not reviewed |  |
| `err.recordNotFound` | The record to cancel was not found. | L’enregistrement à annuler est introuvable. | Kumbukumbu ya kughairi haikupatikana. | not reviewed |  |
| `err.pinDigits` | The code must contain digits only. | Le code ne doit contenir que des chiffres. | Namba lazima iwe na tarakimu tu. | not reviewed |  |
| `err.pinShort` | This code needs at least {n} digits. | Ce code doit avoir au moins {n} chiffres. | Namba hii inahitaji angalau tarakimu {n}. | not reviewed |  |
| `err.pinLong` | The code can have at most {n} digits. | Le code peut avoir au plus {n} chiffres. | Namba inaweza kuwa na tarakimu {n} zaidi. | not reviewed |  |
| `err.pinRepeat` | Avoid codes with one repeated digit. | Évitez les codes avec un seul chiffre répété. | Epuka namba yenye tarakimu moja inayojirudia. | not reviewed |  |
| `err.pinSequence` | Avoid simple sequences like 1234. | Évitez les suites simples comme 1234. | Epuka mfuatano rahisi kama 1234. | not reviewed |  |
| `err.ratesOffline` | No connection. Showing the last rates saved on this device. | Pas de connexion. Affichage des derniers taux enregistrés sur cet appareil. | Hakuna muunganisho. Inaonyesha viwango vya mwisho vilivyohifadhiwa kwenye kifaa hiki. | not reviewed |  |
| `err.ratesFailed` | Could not get rates. | Impossible d’obtenir les taux. | Imeshindwa kupata viwango. | not reviewed |  |
| `err.tooManyDevice` | Too many wrong codes on this device. | Trop de codes incorrects sur cet appareil. | Namba nyingi zisizo sahihi kwenye kifaa hiki. | not reviewed |  |
| `err.savedStay` | Your saved records stay on this device until you sign in again. | Vos enregistrements restent sur cet appareil jusqu’à votre prochaine connexion. | Kumbukumbu zako zilizohifadhiwa zinabaki kwenye kifaa hiki hadi utakapoingia tena. | not reviewed |  |
| `err.serverWrong` | Something went wrong on the server. | Un problème est survenu sur le serveur. | Hitilafu imetokea kwenye seva. | not reviewed |  |
| `err.serverStatus` | Server error ({n}). | Erreur du serveur ({n}). | Hitilafu ya seva ({n}). | not reviewed |  |
| `err.noPermission` | You do not have permission for this. | Vous n’avez pas l’autorisation de faire ceci. | Huna ruhusa ya kufanya hili. | not reviewed |  |
| `err.noPermissionAction` | You do not have permission for this action. | Vous n’avez pas l’autorisation pour cette action. | Huna ruhusa kwa kitendo hiki. | not reviewed |  |
| `err.noPermissionReport` | You do not have permission to download this report. | Vous n’avez pas l’autorisation de télécharger ce rapport. | Huna ruhusa ya kupakua ripoti hii. | not reviewed |  |
| `err.personNotFound` | Person not found. | Personne introuvable. | Mtu huyo hapatikani. | not reviewed |  |
| `err.unknownPerson` | Unknown person. | Personne inconnue. | Mtu asiyejulikana. | not reviewed |  |
| `err.ownerAddsOwner` | Only an owner can add another owner. | Seul un propriétaire peut ajouter un autre propriétaire. | Ni mmiliki pekee anayeweza kuongeza mmiliki mwingine. | not reviewed |  |
| `err.ownerMakesOwner` | Only an owner can make someone an owner. | Seul un propriétaire peut nommer quelqu’un propriétaire. | Ni mmiliki pekee anayeweza kumfanya mtu kuwa mmiliki. | not reviewed |  |
| `err.nameTakenHint` | That name is already used. Add a surname or an initial. | Ce nom est déjà utilisé. Ajoutez un nom de famille ou une initiale. | Jina hilo tayari linatumika. Ongeza jina la ukoo au herufi ya kwanza. | not reviewed |  |
| `err.nameTaken` | That name is already used. | Ce nom est déjà utilisé. | Jina hilo tayari linatumika. | not reviewed |  |
| `err.lastOwner` | There must always be at least one active owner. | Il doit toujours y avoir au moins un propriétaire actif. | Lazima kuwe na angalau mmiliki mmoja aliye hai. | not reviewed |  |
| `err.unknownLocation` | Unknown location. | Lieu inconnu. | Mahali pasipojulikana. | not reviewed |  |
| `err.invalidRequest` | Invalid request. | Demande non valide. | Ombi si sahihi. | not reviewed |  |
| `err.deviceNotFound` | Device not found. | Appareil introuvable. | Kifaa hakipatikani. | not reviewed |  |
| `err.ownDevice` | You cannot block or retire the device you are using. | Vous ne pouvez pas bloquer ou retirer l’appareil que vous utilisez. | Huwezi kuzuia au kustaafisha kifaa unachotumia. | not reviewed |  |
| `err.setupRace` | The business was just set up from another device. Try again to recover owner access. | L’entreprise vient d’être configurée depuis un autre appareil. Réessayez pour récupérer l’accès propriétaire. | Biashara imesanidiwa sasa hivi kutoka kifaa kingine. Jaribu tena kurejesha ufikiaji wa mmiliki. | not reviewed |  |
| `err.busy` | Another device was saving at the same moment. Try again. | Un autre appareil enregistrait au même moment. Réessayez. | Kifaa kingine kilikuwa kinahifadhi wakati huo huo. Jaribu tena. | not reviewed |  |
| `err.unknownVendor` | Unknown vendor. | Fournisseur inconnu. | Muuzaji asiyejulikana. | not reviewed |  |
| `err.unknownGarment` | Unknown garment type. | Type de vêtement inconnu. | Aina ya nguo isiyojulikana. | not reviewed |  |
| `err.unknownSize` | Unknown size category. | Taille inconnue. | Kundi la ukubwa lisilojulikana. | not reviewed |  |
| `err.editNotCancel` | This record is changed by editing, not cancelling. | Cet enregistrement se corrige en le modifiant, pas en l’annulant. | Kumbukumbu hii hubadilishwa kwa kuhariri, si kwa kughairi. | not reviewed |  |
| `err.editNotCancelKind` | This kind of record is changed by editing, not cancelling. | Ce type d’enregistrement se corrige en le modifiant, pas en l’annulant. | Aina hii ya kumbukumbu hubadilishwa kwa kuhariri, si kwa kughairi. | not reviewed |  |
| `err.twoCurrencies` | Pick two different currencies. | Choisissez deux devises différentes. | Chagua sarafu mbili tofauti. | not reviewed |  |
| `err.purchaseNotFound` | Purchase not found. | Achat introuvable. | Ununuzi haupatikani. | not reviewed |  |
| `err.purchaseDependents` | Cancel the collections, inspections, returns and payments of this purchase first. | Annulez d’abord les retraits, contrôles, retours et paiements de cet achat. | Ghairi kwanza uchukuaji, ukaguzi, marejesho na malipo ya ununuzi huu. | not reviewed |  |
| `err.notAwaiting` | This purchase was not waiting for collection. | Cet achat n’attendait pas d’être retiré. | Ununuzi huu haukuwa unasubiri kuchukuliwa. | not reviewed |  |
| `err.notInspection` | This purchase was not delivered for inspection. | Cet achat n’a pas été livré pour contrôle. | Ununuzi huu haukuletwa kwa ukaguzi. | not reviewed |  |
| `err.rejectedReturned` | Some of these rejected pieces were already returned to the vendor. Cancel the return first. | Certaines de ces pièces refusées ont déjà été rendues au fournisseur. Annulez d’abord le retour. | Baadhi ya vipande hivi vilivyokataliwa vimesharudishwa kwa muuzaji. Ghairi marejesho kwanza. | not reviewed |  |
| `err.purchaseCancelled` | This purchase was cancelled. | Cet achat a été annulé. | Ununuzi huu ulighairiwa. | not reviewed |  |
| `err.otherVendor` | This purchase belongs to another vendor. | Cet achat appartient à un autre fournisseur. | Ununuzi huu ni wa muuzaji mwingine. | not reviewed |  |
| `err.sameRoute` | Origin and destination must be different. | Le départ et la destination doivent être différents. | Mahali pa kuanzia na pa kufikia lazima viwe tofauti. | not reviewed |  |
| `err.shipmentNotFound` | Shipment not found. | Envoi introuvable. | Mzigo haupatikani. | not reviewed |  |
| `err.shipmentDependents` | Cancel this shipment’s receipts and cost lines first. | Annulez d’abord les réceptions et les frais de cet envoi. | Ghairi kwanza mapokezi na gharama za mzigo huu. | not reviewed |  |
| `err.shipmentCancelled` | This shipment was cancelled. | Cet envoi a été annulé. | Mzigo huu ulighairiwa. | not reviewed |  |
| `err.costNotActive` | The cost being replaced is not an active cost line of this shipment. | Le frais remplacé n’est pas un frais actif de cet envoi. | Gharama inayobadilishwa si gharama hai ya mzigo huu. | not reviewed |  |
| `err.costNotFound` | Cost line not found. | Frais introuvable. | Gharama haipatikani. | not reviewed |  |
| `err.costReplaced` | This cost was replaced by a later one. Cancel the later one first. | Ce frais a été remplacé par un plus récent. Annulez d’abord le plus récent. | Gharama hii ilibadilishwa na nyingine ya baadaye. Ghairi ile ya baadaye kwanza. | not reviewed |  |
| `err.explainAdjust` | Explain the adjustment in the note. | Expliquez l’ajustement dans la note. | Eleza marekebisho kwenye maelezo. | not reviewed |  |
| `err.notThisClose` | This day is not closed by this record. | Cette journée n’a pas été clôturée par cet enregistrement. | Siku hii haikufungwa na kumbukumbu hii. | not reviewed |  |
| `err.reviewClosedOnly` | Only a closed day can be reviewed. | Seule une journée clôturée peut être vérifiée. | Siku iliyofungwa pekee ndiyo inayoweza kukaguliwa. | not reviewed |  |
| `err.ownName` | Records can only be created in your own name. | Vous ne pouvez enregistrer qu’en votre propre nom. | Unaweza kuweka kumbukumbu kwa jina lako tu. | not reviewed |  |
| `err.managerCancels` | Only a manager can cancel this record. | Seul un responsable peut annuler cet enregistrement. | Ni msimamizi pekee anayeweza kughairi kumbukumbu hii. | not reviewed |  |
| `err.purchaseExists` | This purchase was already recorded. | Cet achat est déjà enregistré. | Ununuzi huu tayari umewekwa. | not reviewed |  |
| `err.shipmentExists` | This shipment was already recorded. | Cet envoi est déjà enregistré. | Mzigo huu tayari umewekwa. | not reviewed |  |
| `err.alreadyCancelled` | This record was already cancelled. | Cet enregistrement a déjà été annulé. | Kumbukumbu hii tayari imeghairiwa. | not reviewed |  |
| `err.tooLarge` | Request is too large. | La demande est trop volumineuse. | Ombi ni kubwa mno. | not reviewed |  |

## Not in this list

The other 750 interface phrases (purchases, shipments, stock, catalogue,
settings, activity log) are lower priority. Downloads (PDF / Excel / CSV) are still **English only**.
