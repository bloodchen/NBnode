const bsv = require('bsv');
const { Address, Bn, Opcode, PublicKey, Script, Tx, TxIn, TxOut, VarInt,BufferReader } = bsv;

/**
 * TXO serialization helpers. 
 */
const TXO = {
    /**
   * Creates a new TXO serialized transaction .
   *
   * @param {src} raw tx string
   * @returns {Object}
   */
  fromRaw( str ) {
    const src = bsv.Transaction(str);
    const txid = bsv.encoding.BufferReader(src._getHash()).readReverse().toString('hex');
    const ins = src.inputs.map(this.inputFromTx)
    const outs = src.outputs.map(this.outputFromTx)
    return {
      tx: { h: txid },
      in: ins,
      out: outs,
      lock: src.nLockTime
    }
  },
  /**
   * Creates a new TXO serialized transaction .
   *
   * @param {src} tx object
   * @returns {Object}
   */
  fromTx( src ) {
    const txid = src.id()
    const ins = src.txIns.map(this.inputFromTx)
    const outs = src.txOuts.map(this.outputFromTx)
    return {
      tx: { h: txid },
      in: ins,
      out: outs,
      lock: src.nLockTime
    }
  },

  /**
   * Creates a new TXO serialized transaction .
   *
   * @param {src} bob object
   * @returns {Object}
   */
  fromBob( src ) {
    const ins = src.in.map(this.inputFromBob)
    const outs = src.out.map(this.outputFromBob)

    const txo = { ...src, in: ins, out: outs }
    delete txo._id
    return txo
  },

  /**
   * Creates a new TXO formatted input from the given TxIn object.
   *
   * @param {TxIn} src Source input
   * @param {Number} index Input index
   * @returns {Object}
   */
  inputFromTx(src, index) {
    const address = src.script.isPublicKeyHashIn() ?
      src.script.toAddress() :
      false;

    const input = {
      i: index,
      e: {
        h: src.prevTxId.toString('hex'),
        i: src.outputIndex,
        a: address
      },
      seq: src.sequenceNumber,
      len: src.script.chunks.length
    }

    return src.script.chunks
      .reduce(fromScriptChunk, input)
  },

  /**
   * Creates a new TXO formatted input from the given BOB input object.
   *
   * @param {Object} src Source input
   * @returns {Object}
   */
  inputFromBob(src) {
    return fromBobTape(src)
  },

  /**
   * Creates a new TXO formatted output from the given TxOut object.
   *
   * @param {TxOut} src Source output
   * @param {Number} index Output index
   * @returns {Object}
   */
  outputFromTx(src, index) {
    const address = src.script.isPublicKeyHashOut() ?
      Address.fromPublicKeyHash(src.script.chunks[2].buf).toString() :
      false;

    const output = {
      i: index,
      e: {
        v: src._satoshisBN.toNumber(),
        i: index,
        a: address
      },
      len: src.script.chunks.length
    }

    return src.script.chunks
      .reduce(fromScriptChunk, output)
  },

  /**
   * Creates a new TXO formatted output from the given BOB output object.
   *
   * @param {Object} src Source output
   * @returns {Object}
   */
  outputFromBob(src) {
    return fromBobTape(src)
  },

  /**
   * Creates a new Tx object from the given Shapeshifter.
   *
   * @param {src} txo object
   * @returns {Tx}
   */
  toTx( src ) {
    
    const txIns = src.in.map(this.toTxIn)
    const txOuts = src.out.map(this.toTxOut)

    new Tx()

    return Tx.fromObject({
      versionBytesNum: 1,
      txIns,
      txInsVi: VarInt.fromNumber(txIns.length),
      txOuts,
      txOutsVi: VarInt.fromNumber(txOuts.length),
      nLockTime: src.lock
    })
  },

  /**
   * Creates a new TxIn object from the given TXO input.
   *
   * @param {Object} src TXO formatted input
   * @returns {TxIn}
   */
  toTxIn(src) {
    const script = toTxScript(src)
    return TxIn.fromObject({
      txHashBuf: Buffer.from(src.e.h, 'hex').reverse(),
      txOutNum: src.e.i,
      sequenceNumber: src.seq,
      script: script,
      scriptVi: VarInt.fromNumber(script.toBuffer().length)
    })
  },

  /**
   * Creates a new TxOut object from the given TXO output.
   *
   * @param {Object} src TXO formatted output
   * @returns {TxOut}
   */
  toTxOut(src) {
    const script = toTxScript(src)
    return TxOut.fromObject({
      valueBn: new Bn(src.e.v),
      script: script,
      scriptVi: VarInt.fromNumber(script.toBuffer().length)
    })
  }
}


/**
 * Reducer function converts a BSV Script chunk to TXO parameters.
 * @private
 */
function fromScriptChunk(obj, chunk, index) {
  // Handle Buffer
  if (chunk.buf) {
    obj[`b${index}`] = chunk.buf.toString('base64')
    obj[`h${index}`] = chunk.buf.toString('hex')
    obj[`s${index}`] = chunk.buf.toString()
  }
  // Handle opcode
  else {
    obj[`o${index}`] = Opcode(chunk.opcodenum).toString()
  }

  return obj
}

/**
 * Creates a TXO formatted input or output from the given BOB src.
 * @private
 */
function fromBobTape(src) {
  const target = src.tape
    .flatMap(t => t.cell)
    .reduce(fromBobCell, { ...src, len: 0 })

  delete target.tape
  return target
}

/**
 * Reducer function converts a BOB cell to TXO parameters.
 * @private
 */
function fromBobCell(obj, cell) {
  const expectedIndex = obj.len
  const index = cell.ii

  if (expectedIndex === index) {
    obj.len++
  } else if (expectedIndex < index) {
    obj[`b${expectedIndex}`] = Buffer.from('|').toString('base64')
    obj[`h${expectedIndex}`] = Buffer.from('|').toString('hex')
    obj[`s${expectedIndex}`] = '|'
    obj.len++
    return fromBobCell(obj, cell)
  }

  if (cell.ops) {
    obj[`o${index}`] = cell.ops
  } else if (cell.f) {
    obj[`f${index}`] = cell.f
  } else {
    obj[`b${index}`] = cell.b
    obj[`h${index}`] = cell.h
    obj[`s${index}`] = cell.s
  }

  return obj
}

/**
 * Converts a TXO attributes to a BSV Tx script.
 * @private
 */
function toTxScript(src) {
  return [...Array(src.len).keys()]
    .reduce((script, index) => {
      if (src[`o${index}`])       { script.writeOpCode(OpCode[src[`o${index}`]]) }
      else if (src[`b${index}`])  { script.writeBuffer(Buffer.from(src[`b${index}`], 'base64')) }
      else if (src[`h${index}`])  { script.writeBuffer(Buffer.from(src[`h${index}`], 'hex')) }
      return script
    }, new Script())
}

module.exports = TXO