import React from 'react';
import { connect } from 'react-redux';

import Header from './Header';
import Link from './Link';

function PageHeader( props ) {
	const { site } = window.AppRegistryData;
	const { user, userLoading } = props;

	const title = <Link href="/">{ site.name }</Link>;

	return <Header title={ title }>
		{ site.menus.primary.map( item =>
			<li key={ item.id }>
				<Link href={ item.href }>
					{ item.title }
				</Link>
			</li>
		) }

		<Header.Separator />

		{ userLoading ?
			<li>Loading…</li>
		: (
			user ?
				<React.Fragment>
					<li><Link href="/apps/mine/">My Apps</Link></li>
					<li><Link href="/profile/">{ user.name }</Link></li>
				</React.Fragment>
			:
				<React.Fragment>
					<li><Link href="/login/">Log In</Link></li>
					<li><a href={ site.register }>Register</a></li>
				</React.Fragment>
		) }
	</Header>
}

const mapStateToProps = state => {
	return {
		userLoading: state.user.loading,
		user: state.user.data,
	};
};

export default connect( mapStateToProps )( PageHeader );
