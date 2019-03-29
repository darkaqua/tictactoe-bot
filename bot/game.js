//@ts-check
const DEBUG_MODE = false;

const width = 3;
const height = 3;

const EMPTY = 0;

const Message = require('discord.js').Message;
const MessageReaction = require('discord.js').MessageReaction;
const User = require('discord.js').User;

const inviteEmojis = ['✅', '❎'];
const numberEmojis = ["1⃣", "2⃣", "3⃣"];
const circleEmojis = [":black_square_button:", ":x:", ":o:"];
const arrowEmojis = [':arrow_right:', ':arrow_up:'];

function arrowToEmoji(arrow) {
    return arrowEmojis[arrow];
}

function playerToEmoji(player) {
    return circleEmojis[player];
}

function columnToEmoji(column) {
    return numberEmojis[column];
}

function reactionCatchError(e) {
    if(e.code === 50013 && !this.permissionsAlerted) {
        this.permissionsAlerted = true;
        this.message.channel.send("My powers are weak, I'm going to need the `Manage Messages` permission.");
    }
}


function validateUserReactionCollector(reaction, user, emoji_list, player_id) {
    //@ts-ignore
    if(user.id === global.bot.user.id)
        return false;

    const validEmoji = emoji_list.indexOf(reaction.emoji.toString()) >= 0;
    const validUser = user.id === player_id;
    if(validEmoji && validUser)
        return true;
    reaction.remove(user).catch(reactionCatchError);
    return false;
}

/**
 * @class
 */
class GameTable {

    constructor() {
        this.fields = Array(width*height).fill(EMPTY);
    }

    /**
     * Puts a chip onto the table
     * @param {number} column
     * @param {number} row
     * @param {number} player
     */
    put(row, column, player){
        if(this.get(row, column) !== EMPTY) return false;
        this.fields[row*width + column] = player;
        return true;
    }

    get(row, column) {
        return this.fields[row*width + column];
    }

    /**
     * Returns true if there is at least one slot available for a chip.
     * @param {number} column 
     */
    columnAvailable(column) {
        return this.fields[column] === EMPTY;
    }

    /**
     * Returns if the table is full of chips.
     * @return {boolean} table is full
     */
    isFull() {
        /* Just check top line because
            there is a thing called gravity. */
        for(let i = 0; i < width*height; i++)
            if(this.fields[i] === EMPTY)
                return false;
        return true;
    }

    winner() {
        
        let i, x, y;
        let player = 0, count = 0;

        const check = (n) => {
            if(this.fields[n] === EMPTY) {
                player = count = 0;
            } else if(player === this.fields[n]) {
                count++;
            } else if(player !== this.fields[n]) {
                player = this.fields[n];
                count = 1;
            }
            return count >= 3;
        };

        //Horizontal
        for(y = 0; y < height; y++ ){
            for(x = 0; x < width; x++) {
                if(check(y * width + x)) {
                    return player;
                }
            }
            count = 0;
        }

        //Vertical
        for(x = 0; x < width; x++) {
            for(y = 0; y < height; y++ ){
                if(check(y * width + x)) {
                    return player;
                }
            }
            count = 0;
        }

        //Diagonals

        //topleft -> bottomright
        for(i = 0; i < width; i++) {
            if(check((2- i) * width + i))
                return player;
        }
        count = 0;

        //topleft -> bottomright
        for(i = 0; i < width; i++) {
            if(check(i * width + i))
                return player;
        }

        return false;
    }

    /**
     * Converts the message to a string of emojis.
     * @return {string} table as string
     */
    toMessage() {
        let column = 3;
        return this.fields.map(playerToEmoji).join("").replace(/(:\w+:){3}/g, m => {
            column--;
            return columnToEmoji(column) +  m + "\n";
        });
        //return this.fields.map(v => `:${v}:`).join("").replace(/(:\d:){7}/g, m => m + "\n");
    }

}

/**
 * @class
 * @property { GameTable } table
 * @property { Message } message
 */
class Game {

    /**
     * @param { Message } message
     */
    constructor(message) {
        this.table = new GameTable();
        this.lastThrow = -1;
        this.players = Array.from([message.author, message.mentions.users.first()]);

        this.invite(message);
    }

    /**
     * Makes the invitation to the requested user.
     */
    invite(message){
        message.channel.send(this.buildInvitationMessage()).then(m => {
            /** @type { Message } */
            this.message = m.constructor === Array ? m[0] : m;
            if(DEBUG_MODE){
                this.start();
                return;
            }
            this.reactionCollector = this.message.createReactionCollector((reaction, user) => {
                return validateUserReactionCollector(reaction, user, inviteEmojis, this.player(2).id);
            });
            this.reactionCollector.on('collect', this.onInviteReaction);
            this.reactInvitation();
        });
        //Bind `this` to onInviteReaction function
        this.onInviteReaction = this.onInviteReaction.bind(this);
    }

    /**
     * Starts the game.
     */
    start(){
        this.started = true;
        this.currentTurn = Math.round(Math.random()) + 1;
        this.currentSelection = 0;
        this.currentPositions = Array.from([0, 0]);
        /** @this Game */
        this.message.edit(this.buildMessage()).then(_ => {
            this.reactionCollector = this.message.createReactionCollector((reaction, user) => {
                return validateUserReactionCollector(reaction, user, numberEmojis, this.player(this.currentTurn).id);
            });
            this.reactionCollector.on('collect', this.onGameReaction);
            this.reactNumbers();
        });
        //Bind `this` to onGameReaction function
        this.onGameReaction = this.onGameReaction.bind(this);
    }

    /**
     * DO NOT CALL
     * Event listener for invite reactions.
     * @param { MessageReaction } reaction
     */
    onInviteReaction(reaction) {
        //Column user selected
        const num = inviteEmojis.indexOf(reaction.emoji.toString());

        if(num === 0){
            this.message.clearReactions().catch(console.error);
            this.start();
            return;
        }
        this.stop();
    }

    /**
     * DO NOT CALL
     * Event listener for game reactions.
     * @param { MessageReaction } reaction
     */
    onGameReaction(reaction) {
        //Column user selected
        const num = numberEmojis.indexOf(reaction.emoji.toString());
        //Remove the reaction the user just added.
        reaction.remove(this.player(this.currentTurn)).catch(console.error);

        this.currentPositions[this.currentSelection] = num;
        if(this.currentSelection === 0){
            this.currentSelection++;

            this.apply();
            return;
        }
        this.currentSelection = 0;

        if(!this.table.put(2 - this.currentPositions[1], this.currentPositions[0], this.currentTurn)){
            this.currentSelection = 0;

            this.apply(`${this.player(this.currentTurn)} this move is not valid, try again.`);
            return;
        }

        reaction.remove(this.player(this.currentTurn)).catch(e => {
            if(e.code === 50013 && !this.permissionsAlerted) {
                this.permissionsAlerted = true;
                this.message.channel.send("My powers are weak, I'm going to need the `Manage Messages` permission.");
            }
        });
        const winner = this.table.winner();
        if(winner) {
            //There is a winner
            this.stop();
            this.apply(`Game Over! ${this.player(winner)} won!`);
        } else if(this.table.isFull()) {
            //Table is full but no winner, it's a tie
            this.stop();
            this.apply(`Game Over! It's a tie, nobody wins.`);
        } else {
            //Nothing special, next turn
            this.nextTurn();
        }
    }

    /**
     * @deprecated
     * Removes number reactions for the columns that have no more space.
     */
    updateReactions() {
        this.message.reactions.filter(reaction => {
            return !this.table.columnAvailable(numberEmojis.indexOf(reaction.emoji.toString()))
        }).forEach(reaction => reaction.remove());
    }

    /**
     * Swaps the player and applies changes.
     */
    nextTurn() {
        this.currentTurn = this.currentTurn === 1 ? 2 : 1;
        this.apply();
    }

    /**
     * Reacts with the invitation emojis.
     */
    reactInvitation(){
        this.message.react(inviteEmojis[0]).then(_ =>
            this.message.react(inviteEmojis[1])
                .catch(console.error)
        ).catch(console.error);
    }
    /**
     * Reacts with the passed number's emoji (adding one).
     * Recursive to avoid disordered reactions.
     * @param {number} [num] 
     */
    reactNumbers(num) {
        num = num || 0;
        if(num > 2) return;
        //If column has no space, skip it.
        if(!this.table.columnAvailable(num)) this.reactNumbers(num + 1);
        this.message.react(columnToEmoji(num))
            .then(_ => {
                //Recursive call
                this.reactNumbers(num + 1)
            })
            .catch(e => console.error(`Reaction error ${num}: ${e.message}`));
    }

    buildInvitationMessage(){
        return `${this.player(1)} wants to play with you ${this.player(2)}, do you accept the challenge?`;
    }

    /**
     * Creates the message from the stored data.
     * @returns {string} the message
     */
    buildMessage(message) {
        let numbers = [0, 1, 2].map(columnToEmoji);
        return [
            `${playerToEmoji(1)} ${this.player(1)} - ${this.player(2)} ${playerToEmoji(2)}\n\n`,
            this.table.toMessage(),
            arrowToEmoji(this.currentSelection) + numbers.join("") + "\n\n",
            message || `${this.player(this.currentTurn)} it's your turn!`
        ].join("");
    }

    /**
     * Returns the user object from the player number
     * @param {number} num 
     */
    player(num) {
        return this.players[num - 1];
    }

    /**
     * Edits the message with the updated table.
     */
    apply(message) {
        this.message.edit(this.buildMessage(message)).catch(console.error);
    }

    /**
     * Ends the game.
     */
    stop(){
        if(this.stopped) return;
        this.message.clearReactions().catch(_ => _);
        if(!this.started){
            this.message.delete(0).catch(console.error);
        }
        if(this.reactionCollector)
            this.reactionCollector.stop();
        this.stopped = true;
    }

}


module.exports = {
    Game: Game,
    GameTable: GameTable
};
