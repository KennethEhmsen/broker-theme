import { isFunction } from 'lodash/lang';
import qs from 'qs';

const fetchOptions = {
	credentials: 'include',
};

const DEFAULT_STATE = {
	archives: {},
	loadingPost: false,
	loadingArchive: false,
	posts: {},
	saving: false,
};

const parseResponse = resp => {
	return resp.json().then( data => {
		if ( resp.ok ) {
			return data;
		}

		const err = new Error( data.message || 'Unknown server error' );
		err.code = data.code || '__unknown';
		err.response = resp;
		err.data = data;
		throw err;
	} );
};

export default class Handler {
	constructor( options ) {
		this.url = options.url;

		this.query = {
			...( options.query || {} ),
			_wpnonce: options.nonce,
		};
		this.archives = {};
		this.fetchOptions = options.fetchOptions || fetchOptions;
		this.rethrow = 'rethrow' in options ? options.rethrow : true;

		const upperType = options.type.toUpperCase();
		this.actions = {
			archiveStart:   `QUERY_${ upperType }_REQUEST`,
			archiveSuccess: `QUERY_${ upperType }`,
			archiveError:   `QUERY_${ upperType }_ERROR`,
			getStart:       `LOAD_${ upperType }_REQUEST`,
			getSuccess:     `LOAD_${ upperType }`,
			getError:       `LOAD_${ upperType }_ERROR`,
			updateStart:    `UPDATE_${ upperType }_REQUEST`,
			updateSuccess:  `UPDATE_${ upperType }`,
			updateError:    `UPDATE_${ upperType }_ERROR`,
			createStart:    `CREATE_${ upperType }_REQUEST`,
			createSuccess:  `CREATE_${ upperType }`,
			createError:    `CREATE_${ upperType }_ERROR`,

			// Allow overrides.
			...( options.actions || {} ),
		};

		this.tempId = 0;
	}

	/**
	 * Register an archive.
	 *
	 * @param {mixed} id Archive key; any scalar.
	 * @param {Object|Function} query Query parameters. Can be a function,
	 *   which receives the state and should return parameters.
	 */
	registerArchive( id, query ) {
		this.archives[ id ] = query;
	}

	fetch( url, query, options = {} ) {
		const args = {
			...this.query,
			...query,
		};

		const fullUrl = url + '?' + qs.stringify( args );
		return fetch( fullUrl, { ...this.fetchOptions, ...options } )
			.then( parseResponse );
	}

	/**
	 * Action creator to fetch an archive.
	 *
	 * Dispatch this action to fetch a registered archive, then use
	 * `getArchive` to load the results:
	 *
	 *     handler.registerArchive( 'my-archive', { orderby: 'title' } );
	 *     dispatch( handler.fetchArchive( 'my-archive' ) );
	 *     const results = handler.getArchive( state.posts, 'my-archive' );
	 *
	 * @param {mixed} id Archive key.
	 * @return {Function} Action to dispatch.
	 */
	fetchArchive = id => ( dispatch, getState ) => {
		if ( ! ( id in this.archives ) ) {
			throw new Error( `Invalid archive ID: ${ id }` );
		}

		dispatch( { type: this.actions.archiveStart, id } );

		const query = this.archives[ id ];
		const queryArgs = isFunction( query ) ? query( getState() ) : query;
		this.fetch( this.url, queryArgs )
			.then( results => {
				dispatch( { type: this.actions.archiveSuccess, id, results } );
				return id;
			} )
			.catch( error => {
				console.log( error );
				dispatch( { type: this.actions.archiveError, id, error } );

				// Rethrow for other promise handlers.
				if ( this.rethrow ) {
					throw error;
				}
			} );
	}

	/**
	 * Is the archive currently being loaded?
	 *
	 * @param {object} substate Substate registered for the type.
	 * @param {mixed} id Archive ID.
	 * @return {Boolean} True if the archive is currently being loaded, false otherwise.
	 */
	isArchiveLoading( substate, id ) {
		return substate.loadingArchive === id;
	}

	/**
	 * Get archive results from the store.
	 *
	 * @param {object} substate Substate registered for the type.
	 * @param {mixed} id Archive ID.
	 * @return {Object[]|null} List of objects in the archive, or null if none loaded.
	 */
	getArchive( substate, id ) {
		if ( ! substate.archives || ! substate.posts ) {
			return null;
		}

		const ids = substate.archives[ id ] || null;
		const posts = ids ? substate.posts.filter( app => ids.indexOf( app.id ) >= 0 ) : null;

		return posts;
	}

	/**
	 * Action creator to fetch a single post.
	 *
	 * @param {Number} id Post ID.
	 * @param {String} context Context to fetch.
	 * @return {Function} Action to dispatch.
	 */
	fetchSingle = ( id, context = 'view' ) => dispatch => {
		dispatch( { type: this.actions.getStart, id } );

		return this.fetch( `${ this.url }/${ id }`, { context } )
			.then( data => {
				dispatch( { type: this.actions.getSuccess, id, data } );
				return id;
			} )
			.catch( error => {
				console.log( error );
				dispatch( { type: this.actions.getError, id, error } );

				// Rethrow for other promise handlers.
				if ( this.rethrow ) {
					throw error;
				}
			} );
	}

	/**
	 * Is the post currently being loaded?
	 *
	 * @param {object} substate Substate registered for the type.
	 * @param {Number} id Post ID.
	 * @return {Boolean} True if the post is currently being loaded, false otherwise.
	 */
	isPostLoading( substate, id ) {
		return substate.loadingSingle === id;
	}

	/**
	 * Get a single post from the store.
	 *
	 * @param {object} substate Substate registered for the type.
	 * @param {Number} id Post ID.
	 * @return {Object|null} Post if available, otherwise null.
	 */
	getSingle( substate, id ) {
		if ( ! substate.posts ) {
			return null;
		}

		return substate.posts.find( post => post.id === id );
	}

	/**
	 * Action creator to update a single post.
	 *
	 * @param {object} data Post object to update. Must have `id` property.
	 * @return {Function} Action to dispatch.
	 */
	updateSingle = data => dispatch => {
		const { id } = data;
		if ( ! id ) {
			throw new Error( 'Post does not have `id` property.' );
		}

		dispatch( { type: this.actions.updateStart, id, data } );

		const options = {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify( data ),
		};
		return this.fetch( `${ this.url }/${ id }`, { context: 'edit' }, options )
			.then( data => {
				dispatch( { type: this.actions.updateSuccess, id, data } );
				return id;
			} )
			.catch( error => {
				console.log( error );
				dispatch( { type: this.actions.updateError, id, error } );

				// Rethrow for other promise handlers.
				if ( this.rethrow ) {
					throw error;
				}
			} );
	}

	/**
	 * Is the post currently being saved?
	 *
	 * @param {object} substate Substate registered for the type.
	 * @param {Number} id Post ID.
	 * @return {Boolean} True if the post is currently being saved, false otherwise.
	 */
	isPostSaving( substate, id ) {
		return substate.saving === id;
	}

	/**
	 * Action creator to create a new post.
	 *
	 * @param {object} data Post data.
	 * @return {Function} Action to dispatch.
	 */
	createSingle = data => dispatch => {
		// Create temporary ID to allow tracking request.
		const id = '_tmp_' + this.tempId++;

		dispatch( { type: this.actions.createStart, id, data } );

		const options = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify( data ),
		};
		return this.fetch( this.url, { context: 'edit' }, options )
			.then( data => {
				dispatch( { type: this.actions.createSuccess, id, data } );
				return data.id;
			} )
			.catch( error => {
				console.log( error );
				dispatch( { type: this.actions.createError, id, error } );

				// Rethrow for other promise handlers.
				if ( this.rethrow ) {
					throw error;
				}
			} );
	}

	/**
	 * Is a post being created?
	 *
	 * @param {object} substate Substate registered for the type.
	 * @return {Boolean} True if a post is being created, false otherwise.
	 */
	isPostCreating( substate ) {
		return substate.saving.indexOf( '_tmp_' ) === 0;
	}

	/**
	 * Reducer for the substate.
	 *
	 * This needs to be added to your store to be functional.
	 *
	 * @param {object} state Store state to reduce against.
	 * @param {object} action Action being dispatched.
	 * @return {object} Reduced state.
	 */
	reducer = ( state = DEFAULT_STATE, action ) => {
		switch ( action.type ) {
			// Archive actions.
			case this.actions.archiveStart:
				return {
					...state,
					loadingArchive: action.id,
				};

			case this.actions.archiveSuccess: {
				const { posts } = state;

				const ids = action.results.map( post => post.id );
				const deduplicated = ( posts || [] ).filter( post => ids.indexOf( post.id ) === -1 );
				return {
					...state,
					loadingArchive: false,
					archives: {
						...state.archives,
						[ action.id ]: ids,
					},
					posts: [
						...deduplicated,
						...action.results,
					],
				};
			}

			case this.actions.archiveError:
				return {
					...state,
					loadingArchive: false,
				};

			// Single actions.
			case this.actions.getStart:
				return {
					...state,
					loadingPost: action.id,
				};

			case this.actions.getSuccess: {
				const { posts } = state;
				// Remove any existing app so we can replace.
				const existing = ( posts || [] ).filter( post => post.id !== action.data.id );
				return {
					...state,
					loadingPost: false,
					posts: [
						...existing,
						action.data,
					],
				};
			}

			case this.actions.getError:
				return {
					...state,
					loadingPost: false,
				};

			case this.actions.createStart:
			case this.actions.updateStart:
				return {
					...state,
					saving: action.id,
				};

			case this.actions.createSuccess:
			case this.actions.updateSuccess: {
				const { posts } = state;
				// Remove any existing app so we can replace.
				const existing = ( posts || [] ).filter( post => post.id !== action.data.id );
				return {
					...state,
					saving: false,
					posts: [
						...existing,
						action.data,
					],
				};
			}

			case this.actions.createError:
			case this.actions.updateError:
				return {
					...state,
					saving: false,
				};

			default:
				return state;
		}
	}
}